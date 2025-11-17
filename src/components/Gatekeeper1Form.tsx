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

  const handleExistingSelection = (record: CustomerRecord, fallbackPhone?: string) => {
    if (!record) return;
    const resolvedPhone = record.phone ? normalizePhone(record.phone) : fallbackPhone || normalizePhone(phone);
    openForm('No', record.id, resolvedPhone);
  };

  const renderCustomerCard = (
    record: CustomerRecord,
    options: { footnote?: React.ReactNode; fallbackPhone?: string } = {}
  ) => {
    if (!record) return null;
    return (
      <button
        key={record.id}
        type="button"
        onClick={() => handleExistingSelection(record, options.fallbackPhone)}
        className="w-full text-left rounded-lg border border-border bg-gray-50 dark:bg-gray-700 p-3 mb-2 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <p className="font-medium">{record.fullName}</p>
        </div>
        {record.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Phone className="h-4 w-4" />
            <p>{record.phone}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">ID Cliente: {record.id}</p>
        {options.footnote && <p className="text-xs text-muted-foreground mt-2">{options.footnote}</p>}
        <p className="text-xs text-primary mt-2">Clicca per usare questo cliente</p>
      </button>
    );
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
              {renderCustomerCard(result.record, { footnote: 'Seleziona per aprire il modulo come cliente esistente', fallbackPhone: cleanedPhone })}
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
              {result.matches.map((m: CustomerRecord) =>
                renderCustomerCard(m, {
                  footnote: 'Clicca per aprire questo cliente',
                  fallbackPhone: cleanedPhone,
                })
              )}
              <p className="mt-3">Vuoi aprire il modulo come <strong>cliente esistente</strong>?</p>
            </>
          );
        } else if (result.reason === 'phone_near') {
          warningMessage = (
            <>
              <p className="mb-2">Attenzione: è stato trovato un cliente con un **numero di telefono SIMILE**:</p>
              {result.matches.map((m: CustomerRecord) =>
                renderCustomerCard(m, {
                  footnote: 'Numero molto simile',
                  fallbackPhone: cleanedPhone,
                })
              )}
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
                  {exactNameMatches.map((m: CustomerRecord) =>
                    renderCustomerCard(m, {
                      footnote: 'Nome e cognome identici',
                      fallbackPhone: cleanedPhone,
                    })
                  )}
                </>
              )}
              {similarNameMatches.length > 0 && (
                <>
                  <p className="mb-2">Attenzione: è stato trovato un cliente con un **nome/cognome SIMILE**:</p>
                  {similarNameMatches.map((m: CustomerRecord) =>
                    renderCustomerCard(m, {
                      footnote: 'Nome simile a quello inserito',
                      fallbackPhone: cleanedPhone,
                    })
                  )}
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
    const hasResults = result.found || result.matches.length > 0 || result.near.length > 0 || result.nameNear.length > 0;

    const baseNoResultMessage =
      context === 'newPartial'
        ? 'Nessun cliente trovato. Compila tutti i campi per inserirne uno nuovo.'
        : result.suggestion || 'Nessun cliente simile trovato con i dati inseriti.';

    const informativeMessage =
      context === 'newPartial'
        ? hasResults
          ? 'Abbiamo trovato clienti simili. Seleziona quello corretto oppure compila tutti i campi per inserirne uno nuovo.'
          : baseNoResultMessage
        : hasResults
          ? 'Ecco i clienti trovati con i dati inseriti.'
          : baseNoResultMessage;

    setMessage({
      type: hasResults ? 'info' : 'warning',
      text: informativeMessage,
    });

    const dialogTitle = (() => {
      if (context === 'newPartial') {
        return hasResults ? 'Cliente forse già presente' : 'Completa i dati per inserirne uno nuovo';
      }
      if (context === 'existing') {
        return hasResults ? 'Seleziona il cliente esistente' : 'Cliente non trovato';
      }
      return hasResults ? 'Risultati della ricerca' : 'Cliente non trovato';
    })();

    const seenIds = new Set<string>();
    const renderSection = (title: string | null, records?: CustomerRecord[], footnote?: string) => {
      if (!records || records.length === 0) return null;
      const uniqueRecords = records.filter((record) => {
        if (!record || seenIds.has(record.id)) return false;
        seenIds.add(record.id);
        return true;
      });
      if (uniqueRecords.length === 0) return null;
      return (
        <React.Fragment key={`${title ?? 'records'}-${seenIds.size}`}>
          {title && <p className="mt-2 font-semibold">{title}</p>}
          {uniqueRecords.map((record) =>
            renderCustomerCard(record, {
              footnote,
              fallbackPhone: cleanedPhone,
            })
          )}
        </React.Fragment>
      );
    };

    setAlertDialogContent({
      title: dialogTitle,
      description: (
        <>
          {hasResults ? (
            <>
              <p className="mb-2">
                {context === 'newPartial'
                  ? 'Prima di inserire un nuovo cliente verifica che non sia già presente. Clicca su un nominativo per aprire il modulo precompilato.'
                  : 'Clicca su un cliente per aprire il modulo precompilato.'}
              </p>
              {renderSection('Cliente trovato', result.found && result.record ? [result.record] : undefined)}
              {renderSection('Corrispondenze dirette', result.matches)}
              {renderSection('Telefoni simili', result.near, 'Numero simile a quello inserito')}
              {renderSection('Nomi simili', result.nameNear, 'Nome simile a quello inserito')}
            </>
          ) : (
            <>
              <p>{baseNoResultMessage}</p>
              {context === 'newPartial' && (
                <p className="mt-2 text-sm text-muted-foreground">Compila Nome, Cognome e Telefono per inserire un nuovo cliente.</p>
              )}
            </>
          )}
        </>
      ),
      confirmText: 'Chiudi',
      onConfirm: () => setIsAlertDialogOpen(false),
      showCancel: false,
    });
    setIsAlertDialogOpen(true);
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
