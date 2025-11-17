"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Info, TriangleAlert, CircleX, User, Phone, Search, ExternalLink, Eraser } from "lucide-react";
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

const MIN_NAME_CHARS = 2;
const MIN_PHONE_DIGITS = 3;

const normalizePhone = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.startsWith("39") && digitsOnly.length > 10) {
    return digitsOnly.slice(2);
  }
  return digitsOnly;
};

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

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setMode('new');
    setLoading(false);
    setMessage(null);
    setIsAlertDialogOpen(false);
    setAlertDialogContent(null);
  };

  const validateInputs = (intent: 'search' | 'open-new' | 'open-existing') => {
    const rawPhone = phone.trim();
    const cleanedPhone = normalizePhone(phone);
    const hasFirstName = firstName.trim().length >= MIN_NAME_CHARS;
    const hasLastName = lastName.trim().length >= MIN_NAME_CHARS;
    const hasPhone = cleanedPhone.length >= MIN_PHONE_DIGITS;
    const anyFieldFilled = firstName.trim() !== '' || lastName.trim() !== '' || cleanedPhone.length > 0;

    if (intent === 'search' || intent === 'open-existing') {
      if (!hasFirstName && !hasLastName && !hasPhone) {
        setMessage({ type: 'error', text: "Inserisci almeno uno tra Nome, Cognome o 3 cifre di Telefono per effettuare una ricerca." });
        return false;
      }
    }

    if (intent === 'open-new') {
      if (!hasFirstName || !hasLastName || !hasPhone) {
        setMessage({ type: 'error', text: "Per inserire un nuovo cliente devi compilare Nome, Cognome e almeno 3 cifre di Telefono." });
        return false;
      }
    }

    if (rawPhone !== '') {
      if (!/^[0-9\s\-\(\)\+]+$/.test(rawPhone)) {
        setMessage({ type: 'error', text: "Il numero di telefono può contenere solo numeri, spazi, trattini, parentesi e il segno più." });
        return false;
      }
      if (cleanedPhone.length > 0 && cleanedPhone.length < MIN_PHONE_DIGITS) {
        setMessage({ type: 'error', text: "Il numero di telefono deve contenere almeno 3 cifre." });
        return false;
      }
    } else if (intent === 'open-new' && !anyFieldFilled) {
      setMessage({ type: 'error', text: "Compila tutti i campi per aprire il modulo di un nuovo cliente." });
      return false;
    }

    return true;
  };

  const triggerExistingLookup = async (context: 'search' | 'existing' | 'newPartial') => {
    setLoading(true);
    try {
      const result = await resolveExisting({ firstName, lastName, phone: normalizePhone(phone) });
      handleResolveExistingResult(result, context);
    } catch (error: any) {
      console.error("Errore durante la ricerca/risoluzione:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setMessage(null);

    if (!validateInputs('search')) return;

    await triggerExistingLookup('search');
  };

  const handleOpenModule = async () => {
    setMessage(null);
    const cleanedPhone = normalizePhone(phone);

    if (mode === 'existing') {
      if (!validateInputs('open-existing')) return;
      await triggerExistingLookup('existing');
      return;
    }

    if (!validateInputs('open-new')) {
      const hasPartialData = firstName.trim() !== '' || lastName.trim() !== '' || cleanedPhone.length > 0;
      if (hasPartialData) {
        await triggerExistingLookup('newPartial');
      }
      return;
    }

    setLoading(true);
    try {
      const result = await checkDuplicate({ firstName, lastName, phone: cleanedPhone });
      handleDuplicateCheckResult(result, cleanedPhone);
    } catch (error: any) {
      console.error("Errore durante il controllo duplicati:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateCheckResult = (result: any, cleanedPhone: string) => {

    switch (result.decision) {
      case 'EXACT_SAME':
        setMessage({ type: 'warning', text: `Cliente già presente: ${result.record.fullName} (${result.record.phone}).` });
        setAlertDialogContent({
          title: "Cliente già presente",
          description: (
            <>
              <p className="mb-2">Il cliente inserito risulta già in elenco con gli stessi dati:</p>
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
              <p>Vuoi aprire il modulo come <strong>cliente esistente</strong>?</p>
            </>
          ),
          confirmText: "Apri come cliente esistente",
          cancelText: "Continua come nuovo",
          onConfirm: () => openForm('No', result.record.id, cleanedPhone),
          onCancel: () => openForm('Sì', '', cleanedPhone),
          showCancel: true,
        });
        setIsAlertDialogOpen(true);
        break;

      case 'WARN_CONFIRM':
        let warningMessage: React.ReactNode;
        if (result.reason === 'phone_exact_name_diff' || result.reason === 'phone_exact') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: esiste già un cliente con lo stesso numero di telefono:</p>
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
              <p className="mt-3">Vuoi aprire il modulo come <strong>cliente esistente</strong>?</p>
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
          console.log("DEBUG: result for name_near:", result); // Log per diagnostica
          // Punto 2: Se Nome =, Cognome =, Numero!= ---> Avviso di omonimia
          const exactNameMatches = result.near.filter((m: CustomerRecord) => m.dist !== undefined && m.dist === 0);
          const similarNameMatches = result.near.filter((m: CustomerRecord) => m.dist !== undefined && m.dist > 0);

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
                      <p className="mt-3">Sei sicuro di voler inserire un **NUOVO cliente**?</p>
                    </Card>
                  ))}
                </>
              )}
              <p className="mt-3">Sei sicuro di voler inserire un **NUOVO cliente**?</p>
            </>
          );
        } else {
          warningMessage = <p>Sono state trovate delle corrispondenze. Sei sicuro di voler inserire un **NUOVO cliente**?</p>;
        }

        if (result.reason === 'phone_exact' || result.reason === 'phone_exact_name_diff') {
          const existingId = result.matches[0]?.id || '';
          setAlertDialogContent({
            title: "Numero già presente",
            description: warningMessage,
            confirmText: "Apri come cliente esistente",
            cancelText: "Continua come nuovo",
            onConfirm: () => openForm('No', existingId, cleanedPhone),
            onCancel: () => openForm('Sì', '', cleanedPhone),
            showCancel: true,
          });
          setIsAlertDialogOpen(true);
        } else {
          setAlertDialogContent({
            title: "Conferma Inserimento Nuovo Cliente",
            description: warningMessage,
            confirmText: "Sì, inserisci come NUOVO",
            cancelText: "Annulla",
            onConfirm: () => openForm('Sì', '', cleanedPhone),
            onCancel: () => setIsAlertDialogOpen(false),
            showCancel: true,
          });
          setIsAlertDialogOpen(true);
        }
        break;

      case 'OK':
        setMessage({ type: 'info', text: "Nessun duplicato rilevante trovato. Puoi procedere con l'inserimento del nuovo cliente." });
        openForm('Sì', '', cleanedPhone);
        break;
    }
  };

  const handleResolveExistingResult = (result: any, context: 'search' | 'existing' | 'newPartial' = 'existing') => {
    const cleanedPhone = normalizePhone(phone);

    if (context !== 'existing') {
      const hasResults = result.found || result.matches.length > 0 || result.near.length > 0 || result.nameNear.length > 0;
      setMessage({
        type: hasResults ? 'info' : 'warning',
        text:
          context === 'newPartial'
            ? 'Per aprire un nuovo cliente servono tutti i campi compilati. Abbiamo cercato possibili clienti simili.'
            : hasResults
              ? 'Ecco i clienti trovati con i dati inseriti.'
              : 'Nessun cliente simile trovato con i dati inseriti.',
      });

      setAlertDialogContent({
        title: context === 'newPartial' ? 'Completa i dati prima di creare un nuovo cliente' : 'Risultati della ricerca',
        description: (
          <>
            {!hasResults && <p className="mb-2">Non sono stati trovati clienti corrispondenti.</p>}
            {result.found && result.record && (
              <>
                <p className="mb-2">Cliente trovato:</p>
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
              </>
            )}
            {result.matches.length > 0 && (
              <>
                <p className="mt-2 font-semibold">Corrispondenze dirette:</p>
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
            {result.near.length > 0 && (
              <>
                <p className="mt-2 font-semibold">Telefoni simili:</p>
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
                <p className="mt-2 font-semibold">Nomi simili:</p>
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
            {context === 'newPartial' && (
              <p className="mt-4 text-sm text-muted-foreground">Compila tutti i campi e riprova per aprire il modulo di un nuovo cliente.</p>
            )}
          </>
        ),
        confirmText: "Chiudi",
        onConfirm: () => setIsAlertDialogOpen(false),
        showCancel: false,
      });
      setIsAlertDialogOpen(true);
      return;
    }

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
        onConfirm: () => openForm('No', result.record.id, cleanedPhone),
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
        onConfirm: () => openForm('Sì', '', cleanedPhone),
        onCancel: () => setIsAlertDialogOpen(false),
        showCancel: true,
      });
      setIsAlertDialogOpen(true);
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

        <div className="flex justify-end">
          <Button
            onClick={resetForm}
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            disabled={loading}
            aria-label="Pulisci campi"
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleSearch} disabled={loading} variant="secondary" className="w-full">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Search className="h-4 w-4" />
                Cerca
              </span>
            )}
          </Button>
          <Button onClick={handleOpenModule} disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Apri Modulo
              </span>
            )}
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
