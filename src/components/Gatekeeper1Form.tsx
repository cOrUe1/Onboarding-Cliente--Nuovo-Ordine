"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Info, TriangleAlert, CircleX, User, Phone, ExternalLink } from "lucide-react";
import { checkDuplicate, resolveExisting, makePrefillUrlGK1 } from "@/api/gatekeeper1";
import { showSuccess, showError } from "@/utils/toast";

interface CustomerRecord {
  id: string;
  fullName: string;
  phone: string;
  nameDist?: number;
  dist?: number;
}

type FormMode = 'new' | 'existing';

const Gatekeeper1Form: React.FC = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<FormMode>('new'); // 'new' for nuovo cliente, 'existing' for cliente esistente
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);

  // State per l'AlertDialog di conferma/avviso
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

  // State per i risultati della ricerca duplicati/esistenti
  const [duplicateMatches, setDuplicateMatches] = useState<CustomerRecord[]>([]);
  const [nameNearMatches, setNameNearMatches] = useState<CustomerRecord[]>([]);
  const [resolvedCustomer, setResolvedCustomer] = useState<CustomerRecord | null>(null);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setMode('new');
    setLoading(false);
    setMessage(null);
    setDuplicateMatches([]);
    setNameNearMatches([]);
    setResolvedCustomer(null);
    setIsAlertDialogOpen(false);
    setAlertDialogContent(null);
  };

  const validateInputs = () => {
    const cleanedPhone = phone.replace(/\D/g, '');
    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    const hasPhone = cleanedPhone.length >= 3;

    if (!hasFirstName && !hasLastName && !hasPhone) {
      setMessage({ type: 'error', text: "Inserisci almeno 2 lettere per nome/cognome o 3 cifre per il telefono." });
      return false;
    }
    return true;
  };

  const handleSearch = async () => {
    setMessage(null);
    setDuplicateMatches([]);
    setNameNearMatches([]);
    setResolvedCustomer(null);

    if (!validateInputs()) return;

    setLoading(true);
    try {
      if (mode === 'new') {
        const result = await checkDuplicate({ firstName, lastName, phone });
        handleDuplicateCheckResult(result);
      } else { // mode === 'existing'
        const result = await resolveExisting({ firstName, lastName, phone });
        handleResolveExistingResult(result);
      }
    } catch (error: any) {
      console.error("Errore durante la ricerca/risoluzione:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateCheckResult = (result: any) => {
    const cleanedPhone = phone.replace(/\D/g, '');
    const currentFullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

    setDuplicateMatches(result.matches || []);
    setNameNearMatches(result.near || []);

    switch (result.decision) {
      case 'EXACT_SAME':
        setAlertDialogContent({
          title: "Cliente ESISTENTE",
          description: (
            <>
              <p className="mb-2">È stato trovato un cliente con **nome, cognome e telefono IDENTICI**:</p>
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
          confirmText: "Apri Modulo (Cliente Esistente)",
          cancelText: "No, inserisci come NUOVO",
          onConfirm: () => openForm('No', result.record.id, result.record.fullName, result.record.phone),
          onCancel: () => openForm('Sì', '', currentFullName, cleanedPhone),
          showCancel: true,
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
              <p className="mt-3">Sei sicuro di voler inserire un **NUOVO cliente** con questo numero?</p>
            </>
          );
        } else if (result.reason === 'phone_near') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: è stato trovato un cliente con un **numero di telefono SIMILE**:</p>
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
              <p className="mt-3">Sei sicuro di voler inserire un **NUOVO cliente**?</p>
            </>
          );
        } else if (result.reason === 'name_near') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: è stato trovato un cliente con un **nome/cognome SIMILE**:</p>
              {result.near.map((m: CustomerRecord) => (
                <Card key={m.id} className="p-3 mb-2 bg-gray-50 dark:bg-gray-700">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <p className="font-medium">{m.fullName}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <p>{m.phone}</p>
                  </div>
                  <p className="mt-3">Sei sicuro di voler inserire un **NUOVO cliente**?</p>
                </Card>
              ))}
            </>
          );
        } else {
          warningMessage = <p>Sono state trovate delle corrispondenze. Sei sicuro di voler inserire un **NUOVO cliente**?</p>;
        }

        setAlertDialogContent({
          title: "Conferma Inserimento Nuovo Cliente",
          description: warningMessage,
          confirmText: "Sì, inserisci come NUOVO",
          cancelText: "Annulla",
          onConfirm: () => openForm('Sì', '', currentFullName, cleanedPhone),
          onCancel: () => setIsAlertDialogOpen(false),
          showCancel: true,
        });
        setIsAlertDialogOpen(true);
        break;

      case 'OK':
        setMessage({ type: 'info', text: "Nessun duplicato rilevante trovato. Puoi procedere con l'inserimento del nuovo cliente." });
        openForm('Sì', '', currentFullName, cleanedPhone);
        break;
    }
  };

  const handleResolveExistingResult = (result: any) => {
    const cleanedPhone = phone.replace(/\D/g, '');
    const currentFullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

    setDuplicateMatches(result.matches || []); // Corrispondenze esatte per telefono
    setNameNearMatches(result.nameNear || []); // Nomi simili
    setResolvedCustomer(result.record || null);

    if (result.found && result.record) {
      setMessage({ type: 'info', text: `Cliente esistente trovato: ${result.record.fullName} (${result.record.phone}).` });
      setAlertDialogContent({
        title: "Cliente Trovato",
        description: (
          <>
            <p className="mb-2">È stato trovato il seguente cliente:</p>
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
        confirmText: "Apri Modulo",
        onConfirm: () => openForm('No', result.record.id, result.record.fullName, result.record.phone),
        showCancel: false,
      });
      setIsAlertDialogOpen(true);
    } else {
      setMessage({ type: 'warning', text: result.suggestion || "Nessun cliente esistente trovato con i dati forniti." });
      setAlertDialogContent({
        title: "Cliente Non Trovato",
        description: (
          <>
            <p className="mb-2">{result.suggestion || "Nessun cliente esistente trovato con i dati forniti."}</p>
            {result.near.length > 0 && (
              <>
                <p className="mt-3 font-semibold">Telefoni simili:</p>
                {result.near.map((m: CustomerRecord) => (
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
            {result.nameNear.length > 0 && (
              <>
                <p className="mt-3 font-semibold">Nomi simili:</p>
                {result.nameNear.map((m: CustomerRecord) => (
                  <Card key={m.id} className="p-3 mb-2 bg-gray-50 dark:bg-gray-700">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <p className="font-medium">{m.fullName}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">ID Cliente: {m.id}</p>
                  </Card>
                ))}
              </>
            )}
            <p className="mt-3">Vuoi comunque aprire il modulo per inserire un **NUOVO cliente**?</p>
          </>
        ),
        confirmText: "Sì, inserisci come NUOVO",
        cancelText: "Annulla",
        onConfirm: () => openForm('Sì', '', currentFullName, cleanedPhone),
        onCancel: () => setIsAlertDialogOpen(false),
        showCancel: true,
      });
      setIsAlertDialogOpen(true);
    }
  };

  const openForm = async (newCustomer: 'Sì' | 'No', customerId: string, fullName: string, cleanedPhone: string) => {
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
      setIsAlertDialogOpen(false); // Chiudi l'alert dialog dopo l'azione
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
      <CardHeader>
        <CardTitle className="text-center text-xl md:text-2xl">Modulo 1: Inserimento Cliente/Ordine</CardTitle>
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

        <RadioGroup value={mode} onValueChange={(value: FormMode) => setMode(value)} className="flex gap-4 justify-center">
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
          <Button onClick={handleSearch} disabled={loading} className="w-full btn">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search mr-2 h-4 w-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Cerca / Apri Modulo</span>}
          </Button>
          <Button onClick={resetForm} variant="outline" className="w-full btn" disabled={loading}>
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

        {/* AlertDialog per conferme e avvisi */}
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
