"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Info, TriangleAlert, CircleX, User, Phone, Search, ExternalLink } from "lucide-react";
import { checkDuplicate, resolveExisting, makePrefillUrlGK1 } from "@/api/gatekeeper1";
import { showSuccess, showError } from "@/utils/toast";

interface CustomerRecord {
  id: string;
  fullName: string;
  phone: string;
  nameDist?: number; // Distanza di Levenshtein per il nome
  dist?: number; // Distanza di Levenshtein per il telefono
}

type FormMode = 'new' | 'existing';

const Gatekeeper1Form: React.FC = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<FormMode>('new');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerRecord[]>([]);

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
    setMode('new');
    setLoading(false);
    setMessage(null);
    setCustomerSearchResults([]);
    setIsAlertDialogOpen(false);
    setAlertDialogContent(null);
  };

  const normalizePhone = (inputPhone: string) => {
    return inputPhone.replace(/\D/g, ''); // Rimuove tutti i non-numeri
  };

  const validateInputForSearch = () => {
    const cleanedPhone = normalizePhone(phone);
    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    const hasPhone = cleanedPhone.length >= 3;

    if (!hasFirstName && !hasLastName && !hasPhone) {
      setMessage({ type: 'error', text: "Inserisci almeno 2 lettere per nome/cognome o 3 cifre per il telefono per la ricerca." });
      return false;
    }
    return true;
  };

  const validateInputForNewCustomerForm = () => {
    const cleanedPhone = normalizePhone(phone);
    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    const hasPhone = cleanedPhone.length >= 3;

    if (!hasFirstName || !hasLastName || !hasPhone) {
      setMessage({ type: 'error', text: "Per inserire un NUOVO cliente, tutti i campi (Nome, Cognome, Telefono) devono essere compilati con almeno 2 lettere/3 cifre." });
      return false;
    }

    // Nuova validazione per il formato del numero di telefono
    if (phone.trim() !== '' && !/^[0-9\s\-\(\)\+]+$/.test(phone.trim())) {
      setMessage({ type: 'error', text: "Il numero di telefono può contenere solo numeri, spazi, trattini, parentesi e il segno più." });
      return false;
    }

    return true;
  };

  const handleSearchCustomers = async () => {
    setMessage(null);
    setCustomerSearchResults([]);

    if (!validateInputForSearch()) return;

    setLoading(true);
    setMessage({ type: 'info', text: "Ricerca clienti in corso…" });
    try {
      const result = await resolveExisting({ firstName, lastName, phone: normalizePhone(phone) });
      const allMatches = [
        ...(result.matches || []),
        ...(result.near || []),
        ...(result.nameNear || []),
      ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i); // Rimuovi duplicati

      setCustomerSearchResults(allMatches);

      if (allMatches.length === 0) {
        setMessage({ type: 'info', text: "Nessun cliente affine trovato. Puoi procedere con l'inserimento di un nuovo cliente." });
      } else {
        setMessage({ type: 'info', text: `Trovati ${allMatches.length} clienti affini.` });
      }
    } catch (error: any) {
      console.error("Errore durante la ricerca clienti:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore durante la ricerca: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewCustomerForm = async () => {
    setMessage(null);
    setCustomerSearchResults([]);

    if (!validateInputForNewCustomerForm()) {
      // Se i campi non sono tutti compilati, esegui una ricerca invece di aprire il modulo
      handleSearchCustomers();
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
        } else { // phone_near or other generic WARN_CONFIRM
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

  const isNewCustomerFormReady = validateInputForNewCustomerForm();

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardHeader>
        <CardTitle className="text-center text-xl md:text-2xl">Inserisci un Cliente o Ordine</CardTitle>
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

        <RadioGroup value={mode} onValueChange={(value: FormMode) => { setMode(value); setCustomerSearchResults([]); setMessage(null); }} className="flex gap-4 justify-center">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="mode-new" disabled={loading} />
            <Label htmlFor="mode-new">Nuovo cliente</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="existing" id="mode-existing" disabled={loading} />
            <Label htmlFor="mode-existing">Cliente esistente</Label>
          </div>
        </RadioGroup>

        <div className="flex flex-col sm:flex-row gap-2">
          {mode === 'new' && isNewCustomerFormReady ? (
            <Button onClick={handleOpenNewCustomerForm} disabled={loading} className="w-full btn">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center"><ExternalLink className="mr-2 h-4 w-4" />Apri Modulo (Nuovo)</span>}
            </Button>
          ) : (
            <Button onClick={handleSearchCustomers} disabled={loading} className="w-full btn">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center"><Search className="mr-2 h-4 w-4" />Cerca Clienti</span>}
            </Button>
          )}
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

        {customerSearchResults.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="text-lg font-semibold">Risultati Ricerca Clienti:</h3>
            {customerSearchResults.map((customer) => (
              <Card
                key={customer.id}
                className="p-2"
              >
                <CardContent className="p-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <p className="font-medium">{customer.fullName}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <p>{customer.phone}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">ID Cliente: {customer.id}</p>
                  </div>
                  <Button onClick={() => openForm('No', customer.id, normalizePhone(customer.phone))} className="btn flex-shrink-0">
                    Apri Modulo (Esistente) <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {mode === 'new' && (
              <Button onClick={() => openForm('Sì', '', normalizePhone(phone))} className="w-full btn mt-4">
                Apri Modulo (Nuovo Cliente) <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
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