"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Info, TriangleAlert, CircleX, User, Phone } from "lucide-react";
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
  const [activeAction, setActiveAction] = useState<'search' | 'open' | null>(null);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);
  const [existingResults, setExistingResults] = useState<CustomerRecord[]>([]);

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
    setActiveAction(null);
    setMessage(null);
    setIsAlertDialogOpen(false);
    setAlertDialogContent(null);
    setExistingResults([]);
  };

  const normalizePhone = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.startsWith('39') && digitsOnly.length > 9) {
      return digitsOnly.slice(2);
    }
    return digitsOnly;
  };

  const hasSearchCriteria = (normalizedPhone: string) => {
    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    return hasFirstName || hasLastName || normalizedPhone.length >= 3;
  };

  const hasAllRequiredFields = (normalizedPhone: string) => {
    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    return hasFirstName && hasLastName && normalizedPhone.length >= 3;
  };

  const validateCommonInputs = (normalizedPhone: string) => {
    const rawPhone = phone.trim();

    if (!hasSearchCriteria(normalizedPhone)) {
      setMessage({ type: 'error', text: "Inserisci almeno 2 lettere per nome/cognome o 3 cifre per il telefono." });
      return false;
    }

    if (rawPhone !== '') {
      if (!/^[0-9\s()+-]+$/.test(rawPhone)) {
        setMessage({ type: 'error', text: "Il numero di telefono può contenere solo numeri, spazi, trattini, parentesi e il segno più." });
        return false;
      }
      if (normalizedPhone.length < 3) {
        setMessage({ type: 'error', text: "Il numero di telefono deve contenere almeno 3 cifre dopo la normalizzazione." });
        return false;
      }
    }

    return true;
  };

  const ensureAllFieldsForNew = (normalizedPhone: string) => {
    if (!hasAllRequiredFields(normalizedPhone)) {
      setMessage({
        type: 'error',
        text: "Per inserire un nuovo cliente compila nome, cognome e telefono (almeno 2 lettere e 3 cifre).",
      });
      return false;
    }
    return true;
  };

  const handleSearch = async () => {
    setMessage(null);
    setExistingResults([]);

    const normalizedPhone = normalizePhone(phone);

    if (!validateCommonInputs(normalizedPhone)) return;

    setLoading(true);
    setActiveAction('search');
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizedPhone,
      };

      if (mode === 'new') {
        const result = await checkDuplicate(payload);
        await handleDuplicateCheckResult(result, normalizedPhone, 'search');
      } else { // mode === 'existing'
        const result = await resolveExisting(payload);
        await handleResolveExistingResult(result, normalizedPhone, 'search');
      }
    } catch (error: any) {
      console.error("Errore durante la ricerca/risoluzione:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const handleOpenModule = async () => {
    setMessage(null);

    const normalizedPhone = normalizePhone(phone);

    if (!validateCommonInputs(normalizedPhone)) return;

    if (mode === 'new' && !ensureAllFieldsForNew(normalizedPhone)) {
      return;
    }

    setLoading(true);
    setActiveAction('open');
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizedPhone,
      };

      if (mode === 'new') {
        const result = await checkDuplicate(payload);
        await handleDuplicateCheckResult(result, normalizedPhone, 'open');
      } else {
        const result = await resolveExisting(payload);
        await handleResolveExistingResult(result, normalizedPhone, 'open');
      }
    } catch (error: any) {
      console.error("Errore durante l'apertura del modulo:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${error.message || 'Riprova più tardi.'}` });
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const handleDuplicateCheckResult = async (result: any, normalizedPhone: string, action: 'search' | 'open') => {

    switch (result.decision) {
      case 'EXACT_SAME': {
        if (result.record) {
          setMessage({ type: 'info', text: `Cliente esistente trovato: ${result.record.fullName} (${result.record.phone}).` });
          setAlertDialogContent({
            title: "Cliente già presente",
            description: (
              <>
                <p className="mb-2">Abbiamo trovato un cliente con gli stessi dati:</p>
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
                <p>Apri il modulo per aggiornarlo come <strong>Cliente esistente</strong>.</p>
              </>
            ),
            confirmText: "Apri come cliente esistente",
            cancelText: "Chiudi",
            onConfirm: () => openForm('No', result.record.id, normalizedPhone),
            onCancel: () => setIsAlertDialogOpen(false),
            showCancel: true,
          });
          setIsAlertDialogOpen(true);
        }
        break;
      }

      case 'WARN_CONFIRM': {
        let warningMessage: React.ReactNode;
        const matchesList: CustomerRecord[] = Array.isArray(result.matches) ? result.matches : [];
        const nearList: CustomerRecord[] = Array.isArray(result.near) ? result.near : [];

        if (result.reason === 'phone_exact_name_diff' || result.reason === 'phone_exact') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: è stato trovato un cliente con un <strong>numero di telefono IDENTICO</strong> ma nome/cognome diversi:</p>
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
              <p className="mt-3">Sei sicuro di voler inserire un <strong>NUOVO cliente</strong> con questo numero?</p>
            </>
          );
        } else if (result.reason === 'phone_near') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: è stato trovato un cliente con un <strong>numero di telefono SIMILE</strong>:</p>
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
              <p className="mt-3">Sei sicuro di voler inserire un <strong>NUOVO cliente</strong>?</p>
            </>
          );
        } else if (result.reason === 'name_near') {
          const exactNameMatches = result.near.filter((m: CustomerRecord) => m.dist !== undefined && m.dist === 0);
          const similarNameMatches = result.near.filter((m: CustomerRecord) => m.dist !== undefined && m.dist > 0);

          warningMessage = (
            <>
              {exactNameMatches.length > 0 && (
                <>
                  <p className="mb-2">Attenzione: è stata rilevata <strong>omonimia</strong> con il seguente cliente (nome e cognome identici, ma telefono diverso):</p>
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
                  <p className="mb-2">Attenzione: è stato trovato un cliente con un <strong>nome/cognome SIMILE</strong>:</p>
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
                      <p className="mt-3">Sei sicuro di voler inserire un <strong>NUOVO cliente</strong>?</p>
                    </Card>
                  ))}
                </>
              )}
              <p className="mt-3">Sei sicuro di voler inserire un <strong>NUOVO cliente</strong>?</p>
            </>
          );
        } else {
          warningMessage = <p>Sono state trovate delle corrispondenze. Sei sicuro di voler inserire un <strong>NUOVO cliente</strong>?</p>;
        }

        setAlertDialogContent({
          title: "Conferma Inserimento Nuovo Cliente",
          description: warningMessage,
          confirmText: "Apri come nuovo cliente",
          cancelText: "Annulla",
          onConfirm: () => {
            if (!ensureAllFieldsForNew(normalizedPhone)) {
              setIsAlertDialogOpen(false);
              return;
            }
            openForm('Sì', '', normalizedPhone);
          },
          onCancel: () => setIsAlertDialogOpen(false),
          showCancel: true,
        });
        setIsAlertDialogOpen(true);
        if (action === 'search') {
          setMessage({ type: 'warning', text: "Sono state trovate corrispondenze simili. Conferma prima di inserire un nuovo cliente." });
        }
        break;
      }

      case 'OK': {
        if (action === 'open') {
          if (!ensureAllFieldsForNew(normalizedPhone)) {
            return;
          }
          await openForm('Sì', '', normalizedPhone);
        } else {
          setMessage({ type: 'info', text: "Nessun duplicato rilevante trovato." });
        }
        break;
      }
    }
  };

  const handleResolveExistingResult = async (result: any, normalizedPhone: string, _action: 'search' | 'open') => {
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
            <p>Vuoi aprire il modulo per <strong>aggiornare questo cliente esistente</strong>?</p>
          </>
        ),
        confirmText: "Apri Modulo",
        onConfirm: () => openForm('No', result.record.id, normalizedPhone),
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
            <p className="mt-3">Vuoi comunque aprire il modulo per inserire un <strong>NUOVO cliente</strong>?</p>
          </>
        ),
        confirmText: "Apri come nuovo cliente",
        cancelText: "Annulla",
        onConfirm: () => {
          if (!ensureAllFieldsForNew(normalizedPhone)) {
            setIsAlertDialogOpen(false);
            return;
          }
          openForm('Sì', '', normalizedPhone);
        },
        onCancel: () => setIsAlertDialogOpen(false),
        showCancel: true,
      });
      setIsAlertDialogOpen(true);
    }
  };

  const openForm = async (newCustomer: 'Sì' | 'No', customerId: string, normalizedPhone: string) => {
    setLoading(true);
    setActiveAction('open');
    setMessage({ type: 'info', text: "Apertura modulo..." });
    try {
      const prefillUrl = await makePrefillUrlGK1({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizedPhone,
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
      setActiveAction(null);
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

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button onClick={handleSearch} disabled={loading} className="w-full sm:flex-1">
            {activeAction === 'search' && loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-search mr-2 h-4 w-4"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                Cerca
              </span>
            )}
          </Button>
          <Button
            onClick={resetForm}
            variant="ghost"
            size="sm"
            className="sm:w-auto self-end sm:self-auto"
            disabled={loading}
          >
            Pulisci
          </Button>
        </div>
        <Button onClick={handleOpenModule} disabled={loading} className="w-full">
          {activeAction === 'open' && loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            "Apri Modulo"
          )}
        </Button>

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
