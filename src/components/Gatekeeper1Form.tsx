"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Info, TriangleAlert, CircleX, User, Phone, ExternalLink, ArrowLeft } from "lucide-react";
import { checkDuplicate, makePrefillUrlGK1 } from "@/api/gatekeeper1";
import { showSuccess, showError } from "@/utils/toast";

interface CustomerRecord {
  id: string;
  fullName: string;
  phone: string;
  nameDist?: number;
  dist?: number;
}

interface Gatekeeper1FormProps {
  onBack: () => void;
  onSuggestSearch: () => void;
}

const Gatekeeper1Form: React.FC<Gatekeeper1FormProps> = ({ onBack, onSuggestSearch }) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);

  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [alertDialogContent, setAlertDialogContent] = useState<{
    title: string;
    description: React.ReactNode;
    confirmText: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    showCancel: boolean;
  } | null>(null);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setLoading(false);
    setMessage(null);
    setIsAlertDialogOpen(false);
    setAlertDialogContent(null);
  };

  const normalizePhone = (inputPhone: string) => {
    return inputPhone.replace(/\D/g, '');
  };

  const validateInputForNewCustomerForm = () => {
    const cleanedPhone = normalizePhone(phone);
    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    const hasPhone = cleanedPhone.length >= 3;

    if (!hasFirstName || !hasLastName || !hasPhone) {
      setMessage({ type: 'warning', text: "Per inserire un NUOVO cliente, tutti i campi (Nome, Cognome, Telefono) devono essere compilati con almeno 2 lettere/3 cifre. Altrimenti, prova a cercarlo." });
      return false;
    }

    if (phone.trim() !== '' && !/^[0-9\s\-\(\)\+]+$/.test(phone.trim())) {
      setMessage({ type: 'error', text: "Il numero di telefono può contenere solo numeri, spazi, trattini, parentesi e il segno più." });
      return false;
    }

    return true;
  };

  const handleOpenNewCustomerForm = async () => {
    setMessage(null);

    if (!validateInputForNewCustomerForm()) {
      setAlertDialogContent({
        title: "Campi Incompleti",
        description: (
          <>
            <p className="mb-2">Per inserire un NUOVO cliente, tutti i campi (Nome, Cognome, Telefono) devono essere compilati con almeno 2 lettere/3 cifre.</p>
            <p>Vuoi procedere con una ricerca per vedere se il cliente esiste già?</p>
          </>
        ),
        confirmText: "Sì, cerca cliente",
        cancelText: "Annulla",
        onConfirm: () => {
          setIsAlertDialogOpen(false);
          onSuggestSearch();
        },
        onCancel: () => setIsAlertDialogOpen(false),
        showCancel: true,
      });
      setIsAlertDialogOpen(true);
      return;
    }

    setLoading(true);
    setMessage({ type: 'info', text: "Verifica duplicati in corso…" });
    try {
      const result = await checkDuplicate({ firstName, lastName, phone: normalizePhone(phone) });
      handleDuplicateCheckResult(result);
    } catch (error: any) {
      console.error("Errore durante la verifica duplicati:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateCheckResult = (result: any) => {
    const cleanedPhone = normalizePhone(phone);

    switch (result.decision) {
      case 'EXACT_SAME':
        setMessage({ type: 'info', text: `Cliente esistente trovato: ${result.record.fullName} (${result.record.phone}).` });
        setAlertDialogContent({
          title: "Cliente Esistente Trovato",
          description: (
            <>
              <p className="mb-2">È stato trovato un cliente con Nome, Cognome e Telefono identici:</p>
              <Card className="p-3 mb-3 bg-gray-50 dark:bg-gray-700">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <p className="font-medium">{result.record.fullName}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <p>{result.record.phone}</p>
                </div>
                <p className="text-sm text-muted-foreground">ID Cliente: {result.record.id}</p>
              </Card>
              <p>Vuoi aprire il modulo per **aggiornare questo cliente esistente**?</p>
            </>
          ),
          confirmText: "Apri Modulo (Esistente)",
          onConfirm: () => openForm('No', result.record.id, cleanedPhone),
          showCancel: false,
        });
        setIsAlertDialogOpen(true);
        break;

      case 'WARN_CONFIRM':
        let warningMessage: React.ReactNode;
        if (result.reason === 'phone_exact_name_diff' || result.reason === 'phone_exact') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: è stato trovato un cliente con un **numero di telefono IDENTICO** ma nome/cognome diversi:</p>
              {result.matches.map((m: CustomerRecord) => (
                <Card key={m.id} className="p-3 mb-2 bg-gray-50 dark:bg-gray-700">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <p className="font-medium">{m.fullName}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <p>{m.phone}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">ID Cliente: {m.id}</p>
                </Card>
              ))}
              <p className="mt-3">Vuoi aprire il modulo per **aggiornare il cliente esistente** o inserire un **NUOVO cliente** con questo numero?</p>
            </>
          );
          setAlertDialogContent({
            title: "Conflitto Telefono Esistente",
            description: warningMessage,
            confirmText: "Apri Modulo (Esistente)",
            cancelText: "Inserisci come NUOVO",
            onConfirm: () => openForm('No', result.matches[0].id, cleanedPhone),
            onCancel: () => openForm('Sì', '', cleanedPhone),
            showCancel: true,
          });
        } else if (result.reason === 'name_near') {
          const exactNameMatches = result.near.filter((m: CustomerRecord) => m.nameDist !== undefined && m.nameDist === 0);
          const similarNameMatches = result.near.filter((m: CustomerRecord) => m.nameDist !== undefined && m.nameDist > 0);

          warningMessage = (
            <>
              {exactNameMatches.length > 0 && (
                <>
                  <p className="mb-2">Attenzione: è stata rilevata **omonimia** con il seguente cliente (nome e cognome identici, ma telefono diverso):</p>
                  {exactNameMatches.map((m: CustomerRecord) => (
                    <Card key={m.id} className="p-3 mb-2 bg-gray-50 dark:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <p className="font-medium">{m.fullName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <p>{m.phone}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">ID Cliente: {m.id}</p>
                    </Card>
                  ))}
                </>
              )}
              {similarNameMatches.length > 0 && (
                <>
                  <p className="mb-2">Attenzione: è stato trovato un cliente con un **nome/cognome SIMILE**:</p>
                  {similarNameMatches.map((m: CustomerRecord) => (
                    <Card key={m.id} className="p-3 mb-2 bg-gray-50 dark:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <p className="font-medium">{m.fullName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <p>{m.phone}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">ID Cliente: {m.id}</p>
                    </Card>
                  ))}
                </>
              )}
              <p className="mt-3">Sei sicuro di voler inserire un **NUOVO cliente**?</p>
            </>
          );
          setAlertDialogContent({
            title: "Avviso di Omonimia / Nome Simile",
            description: warningMessage,
            confirmText: "Sì, inserisci come NUOVO",
            cancelText: "Annulla",
            onConfirm: () => openForm('Sì', '', cleanedPhone),
            onCancel: () => setIsAlertDialogOpen(false),
            showCancel: true,
          });
        } else {
          warningMessage = (
            <>
              <p className="mb-2">Sono state trovate delle corrispondenze con i dati inseriti. Sei sicuro di voler inserire un **NUOVO cliente**?</p>
              {result.matches.length > 0 && (
                <>
                  <p className="mt-3 font-semibold">Corrispondenze trovate:</p>
                  {result.matches.map((m: CustomerRecord) => (
                    <Card key={m.id} className="p-3 mb-2 bg-gray-50 dark:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <p className="font-medium">{m.fullName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <p>{m.phone}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">ID Cliente: {m.id}</p>
                    </Card>
                  ))}
                </>
              )}
            </>
          );
          setAlertDialogContent({
            title: "Conferma Inserimento Nuovo Cliente",
            description: warningMessage,
            confirmText: "Sì, inserisci come NUOVO",
            cancelText: "Annulla",
            onConfirm: () => openForm('Sì', '', cleanedPhone),
            onCancel: () => setIsAlertDialogOpen(false),
            showCancel: true,
          });
        }
        setIsAlertDialogOpen(true);
        break;

      case 'OK':
        setMessage({ type: 'info', text: "Nessun duplicato rilevante trovato. Apertura modulo per nuovo cliente." });
        openForm('Sì', '', cleanedPhone);
        break;
    }
  };

  const openForm = async (newCustomer: 'Sì' | 'No', customerId: string, cleanedPhone: string) => {
    setLoading(true);
    setMessage({ type: 'info', text: "Apertura modulo..." });
    try {
      const prefillUrl = await makePrefillUrlGK1({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: cleanedPhone,
        newCustomer: newCustomer,
        customerId: customerId,
      });

      if (prefillUrl) {
        if (window.top) {
          window.top.location.assign(prefillUrl);
        } else {
          window.location.assign(prefillUrl);
        }
        showSuccess("Modulo aperto con successo!");
      } else {
        throw new Error("URL precompilato non generato.");
      }
    } catch (error: any) {
      console.error("Errore durante la generazione o l'apertura dell'URL del modulo:", error);
      showError(`Impossibile aprire il modulo: ${error.message || 'Riprova.'}`);
      setMessage({ type: 'error', text: `Impossibile aprire il modulo: ${error.message || 'Riprova.'}` });
    } finally {
      setLoading(false);
      setIsAlertDialogOpen(false);
    }
  };

  const getAlertIcon = (type: 'info' | 'warning' | 'error') => {
    switch (type) {
      case 'info': return <Info className="h-4 w-4" />;
      case 'warning': return <TriangleAlert className="h-4 w-4" />;
      case 'error': return <CircleX className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onBack} className="btn">
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Indietro</span>
        </Button>
        <CardTitle className="text-center text-xl md:text-2xl flex-grow">Inserisci Nuovo Cliente/Ordine</CardTitle>
        <div className="w-10"></div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <Input
          type="text"
          placeholder="Nome"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="input"
          disabled={loading}
        />
        <Input
          type="text"
          placeholder="Cognome"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="input"
          disabled={loading}
        />
        <Input
          type="tel"
          placeholder="333 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="input"
          disabled={loading}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleOpenNewCustomerForm} disabled={loading} className="w-full btn">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center"><ExternalLink className="mr-2 h-4 w-4" />Apri Modulo</span>}
          </Button>
          <Button onClick={resetForm} variant="ghost" className="w-full btn" disabled={loading}>
            Pulisci
          </Button>
        </div>

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mt-4" aria-live="polite">
            {getAlertIcon(message.type)}
            <AlertTitle>{message.type === 'error' ? 'Errore' : message.type === 'warning' ? 'Attenzione' : 'Info'}</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <AlertDialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{alertDialogContent?.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {alertDialogContent?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {alertDialogContent?.showCancel && (
                <AlertDialogCancel onClick={alertDialogContent.onCancel}>
                  {alertDialogContent.cancelText || "Annulla"}
                </AlertDialogCancel>
              )}
              <AlertDialogAction onClick={alertDialogContent?.onConfirm}>
                {alertDialogContent?.confirmText}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default Gatekeeper1Form;