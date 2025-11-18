"use client";

import React, { useState } from "react";
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

type AsyncReturnType<T extends (...args: unknown[]) => Promise<unknown>> = T extends (...args: unknown[]) => Promise<infer R> ? R : never;
type DuplicateCheckResult = AsyncReturnType<typeof checkDuplicate>;
type ResolveExistingResult = AsyncReturnType<typeof resolveExisting>;
type LookupIntent = 'search' | 'open' | 'partial-new';

interface MatchSection {
  title: string;
  description?: string;
  items: CustomerRecord[];
}

const Gatekeeper1Form: React.FC = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<FormMode>('new'); // 'new' for nuovo cliente, 'existing' for cliente esistente
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);
  const [matchSections, setMatchSections] = useState<MatchSection[]>([]);
  const [activeAction, setActiveAction] = useState<'search' | 'open' | null>(null);

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
    setMatchSections([]);
    setActiveAction(null);
  };

  const normalizePhone = (value: string) => {
    let digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.startsWith("00")) {
      digitsOnly = digitsOnly.slice(2);
    }
    if (digitsOnly.startsWith("39") && digitsOnly.length > 9) {
      digitsOnly = digitsOnly.slice(2);
    }
    return digitsOnly;
  };

  const rawPhone = phone.trim();
  const cleanedPhone = normalizePhone(phone);
  const hasFirstName = firstName.trim().length >= 2;
  const hasLastName = lastName.trim().length >= 2;
  const hasPhone = cleanedPhone.length >= 3;
  const hasAnySearchableField = hasFirstName || hasLastName || hasPhone;
  const hasAllRequiredFields = hasFirstName && hasLastName && hasPhone;
  const getPhoneForLookup = () => (hasPhone ? cleanedPhone : "000");

  const validatePhoneCharacters = () => {
    if (rawPhone === "") return true;
    if (!/^[0-9\s()+-]+$/.test(rawPhone)) {
      setMessage({ type: 'error', text: "Il numero di telefono può contenere solo numeri, spazi, trattini, parentesi e il segno più." });
      return false;
    }
    if (cleanedPhone.length > 0 && cleanedPhone.length < 3) {
      setMessage({ type: 'error', text: "Il numero di telefono deve contenere almeno 3 cifre." });
      return false;
    }
    return true;
  };

  const ensureSearchableInputs = () => {
    if (!hasAnySearchableField) {
      setMessage({ type: 'error', text: "Inserisci almeno 2 lettere per nome/cognome o 3 cifre per il telefono." });
      return false;
    }
    return validatePhoneCharacters();
  };

  const clearFeedback = () => {
    setMessage(null);
    setMatchSections([]);
  };

  const extractErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string" && error.length > 0) return error;
    return "Errore sconosciuto.";
  };

  const startLoading = (action: 'search' | 'open') => {
    setLoading(true);
    setActiveAction(action);
  };

  const stopLoading = () => {
    setLoading(false);
    setActiveAction(null);
  };

  const handleSearch = async () => {
    clearFeedback();
    if (!ensureSearchableInputs()) return;

    startLoading('search');
    try {
      if (mode === 'new') {
        const shouldResolveExisting = !hasAllRequiredFields;
        if (shouldResolveExisting) {
          const lookupPhone = getPhoneForLookup();
          const result = await resolveExisting({ firstName: firstName.trim(), lastName: lastName.trim(), phone: lookupPhone });
          handleResolveExistingResult(result, 'search', lookupPhone);
        } else {
          const result = await checkDuplicate({ firstName: firstName.trim(), lastName: lastName.trim(), phone: cleanedPhone });
          handleDuplicateCheckResult(result, 'search', cleanedPhone);
        }
      } else {
        const lookupPhone = getPhoneForLookup();
        const result = await resolveExisting({ firstName: firstName.trim(), lastName: lastName.trim(), phone: lookupPhone });
        handleResolveExistingResult(result, 'search', lookupPhone);
      }
    } catch (error: unknown) {
      console.error("Errore durante la ricerca/risoluzione:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${extractErrorMessage(error)}` });
    } finally {
      stopLoading();
    }
  };

  const handleOpenModule = async () => {
    clearFeedback();
    if (!validatePhoneCharacters()) return;

    if (mode === 'existing') {
      if (!hasAnySearchableField) {
        setMessage({ type: 'warning', text: "Inserisci almeno uno dei tre campi per aprire il modulo di un cliente esistente." });
        return;
      }
      await resolveExistingFlow('open');
      return;
    }

    if (!hasAllRequiredFields) {
      setMessage({ type: 'warning', text: "Per inserire un nuovo cliente devi compilare Nome, Cognome e Telefono. Ti mostro i clienti simili trovati." });
      await resolveExistingFlow('partial-new');
      return;
    }

    await duplicateCheckFlow('open');
  };

  const resolveExistingFlow = async (intent: LookupIntent) => {
    startLoading(intent === 'search' ? 'search' : 'open');
    try {
      const lookupPhone = getPhoneForLookup();
      const result = await resolveExisting({ firstName: firstName.trim(), lastName: lastName.trim(), phone: lookupPhone });
      handleResolveExistingResult(result, intent, lookupPhone);
    } catch (error: unknown) {
      console.error("Errore durante la ricerca del cliente esistente:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${extractErrorMessage(error)}` });
    } finally {
      stopLoading();
    }
  };

  const duplicateCheckFlow = async (intent: LookupIntent) => {
    startLoading('open');
    try {
      const result = await checkDuplicate({ firstName: firstName.trim(), lastName: lastName.trim(), phone: cleanedPhone });
      handleDuplicateCheckResult(result, intent, cleanedPhone);
    } catch (error: unknown) {
      console.error("Errore durante il controllo duplicati:", error);
      setMessage({ type: 'error', text: `Si è verificato un errore: ${extractErrorMessage(error)}` });
    } finally {
      stopLoading();
    }
  };

  const handleDuplicateCheckResult = (result: DuplicateCheckResult, intent: LookupIntent, normalizedPhone: string) => {
    const matchList = result.matches ?? [];
    const nearList = result.near ?? [];
    const sections: MatchSection[] = [];

    if (matchList.length > 0) {
      sections.push({
        title: "Corrispondenze trovate",
        description: "Clienti con dati uguali o molto simili.",
        items: matchList,
      });
    }

    if (nearList.length > 0) {
      sections.push({
        title: "Nomi o telefoni affini",
        description: "Controlla attentamente prima di proseguire.",
        items: nearList,
      });
    }

    setMatchSections(sections);

    switch (result.decision) {
      case 'EXACT_SAME':
        if (intent === 'search' || intent === 'partial-new') {
          setMessage({ type: 'info', text: "Esiste già un cliente identico. Apri il modulo come cliente esistente per aggiornarlo." });
          return;
        }

        setAlertDialogContent({
          title: "Cliente già presente",
          description: (
            <>
              <p className="mb-2">È stato trovato un cliente con gli stessi Nome, Cognome e Telefono.</p>
              {result.record && (
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
              )}
              <p>Apri il modulo come <strong>Cliente esistente</strong> per evitare duplicati.</p>
            </>
          ),
          confirmText: "Apri come Cliente esistente",
          cancelText: "Annulla",
          onConfirm: () => openForm('No', result.record?.id || '', normalizedPhone),
          onCancel: () => setIsAlertDialogOpen(false),
          showCancel: true,
        });
        setIsAlertDialogOpen(true);
        return;

      case 'WARN_CONFIRM': {
        let warningMessage: React.ReactNode = <p>Sono state trovate delle corrispondenze. Vuoi procedere?</p>;

        if (result.reason === 'phone_exact' || result.reason === 'phone_exact_name_diff') {
          warningMessage = (
            <>
              <p className="mb-2">È già presente un cliente con lo stesso numero di telefono.</p>
              {matchList.map((m) => (
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
              <p className="mt-3">Procedi come <strong>cliente esistente</strong> per non creare duplicati.</p>
            </>
          );

          if (intent === 'search') {
            setMessage({ type: 'warning', text: "Numero già presente. Passa a 'Cliente esistente' o aggiorna il record." });
            return;
          }

          setAlertDialogContent({
            title: "Telefono già registrato",
            description: warningMessage,
            confirmText: "Apri come Cliente esistente",
            cancelText: "Annulla",
            onConfirm: () => {
              const existingId = matchList[0]?.id || '';
              openForm('No', existingId, normalizedPhone);
            },
            onCancel: () => setIsAlertDialogOpen(false),
            showCancel: true,
          });
          setIsAlertDialogOpen(true);
          return;
        }

        if (result.reason === 'name_near') {
          warningMessage = (
            <>
              <p className="mb-2">Nome e cognome risultano già presenti, ma con telefono diverso.</p>
              {nearList.map((m) => (
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
              <p className="mt-3">Confermi di voler procedere comunque come <strong>Nuovo cliente</strong>?</p>
            </>
          );
        } else if (result.reason === 'phone_near') {
          warningMessage = (
            <>
              <p className="mb-2">È stato trovato un numero molto simile.</p>
              {matchList.concat(nearList).map((m) => (
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
              <p className="mt-3">Vuoi inserire comunque un nuovo cliente?</p>
            </>
          );
        }

        if (intent === 'search') {
          setMessage({ type: 'warning', text: "Sono stati trovati nominativi simili. Controlla i dettagli prima di procedere." });
          return;
        }

        setAlertDialogContent({
          title: "Possibile duplicato",
          description: warningMessage,
          confirmText: "Sì, inserisci come NUOVO",
          cancelText: "Annulla",
          onConfirm: () => openForm('Sì', '', normalizedPhone),
          onCancel: () => setIsAlertDialogOpen(false),
          showCancel: true,
        });
        setIsAlertDialogOpen(true);
        return;
      }

      case 'OK':
        if (intent === 'search' || intent === 'partial-new') {
          setMessage({ type: 'info', text: "Nessun duplicato rilevato. Puoi procedere con un nuovo inserimento." });
          return;
        }
        setMessage({ type: 'info', text: "Nessun duplicato rilevante trovato. Apertura del modulo nuovo cliente." });
        openForm('Sì', '', normalizedPhone);
        return;
    }
  };

  const handleResolveExistingResult = (result: ResolveExistingResult, intent: LookupIntent, normalizedPhone: string) => {
    const matches = result.matches ?? [];
    const near = result.near ?? [];
    const nameNear = result.nameNear ?? [];
    const sections: MatchSection[] = [];

    if (matches.length > 0) {
      sections.push({
        title: "Clienti trovati",
        description: "Questi clienti corrispondono ai dati inseriti.",
        items: matches,
      });
    }
    if (near.length > 0) {
      sections.push({
        title: "Telefoni simili",
        description: "Numeri molto vicini alla ricerca.",
        items: near,
      });
    }
    if (nameNear.length > 0) {
      sections.push({
        title: "Nomi simili",
        description: "Verifica eventuali omonimie.",
        items: nameNear,
      });
    }

    setMatchSections(sections);

    if (intent === 'search' || intent === 'partial-new') {
      const total = matches.length + near.length + nameNear.length;
      if (total === 0) {
        setMessage({ type: 'info', text: "Nessun cliente affine trovato." });
      } else {
        setMessage({
          type: intent === 'partial-new' ? 'warning' : 'info',
          text: intent === 'partial-new'
            ? "Completa tutti i campi e verifica i clienti simili prima di inserire un nuovo record."
            : `Trovati ${total} clienti compatibili. Usa 'Apri Modulo' per gestirli.`,
        });
      }
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
            <p>Vuoi aprire il modulo per <strong>aggiornare questo cliente esistente</strong>?</p>
          </>
        ),
        confirmText: "Apri Modulo",
        onConfirm: () => openForm('No', result.record.id, normalizedPhone),
        showCancel: false,
      });
      setIsAlertDialogOpen(true);
      return;
    }

    setMessage({ type: 'warning', text: result.suggestion || "Nessun cliente esistente trovato con i dati forniti." });
    setAlertDialogContent({
      title: "Cliente Non Trovato",
      description: (
        <>
          <p className="mb-2">{result.suggestion || "Nessun cliente esistente trovato con i dati forniti."}</p>
          <p className="mt-3">Vuoi aprire il modulo per inserire un <strong>nuovo cliente</strong>?</p>
        </>
      ),
      confirmText: "Sì, inserisci come NUOVO",
      cancelText: "Annulla",
      onConfirm: () => openForm('Sì', '', normalizedPhone),
      onCancel: () => setIsAlertDialogOpen(false),
      showCancel: true,
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
    } catch (error: unknown) {
      console.error("Errore durante la generazione o l'apertura dell'URL del modulo:", error);
      const errMessage = extractErrorMessage(error);
      showError(`Impossibile aprire il modulo: ${errMessage}`);
      setMessage({ type: 'error', text: `Impossibile aprire il modulo: ${errMessage}` });
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

  const isSearchLoading = loading && activeAction === 'search';
  const isOpenLoading = loading && activeAction === 'open';

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

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSearch} disabled={loading} variant="secondary" className="w-full flex items-center justify-center gap-2">
              {isSearchLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Ricerca…</span>
                </>
              ) : (
                <span className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search mr-2 h-4 w-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  Cerca
                </span>
              )}
            </Button>
            <Button onClick={handleOpenModule} disabled={loading} className="w-full flex items-center justify-center gap-2">
              {isOpenLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Apertura…</span>
                </>
              ) : (
                "Apri Modulo"
              )}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={resetForm} variant="ghost" size="sm" className="text-muted-foreground" disabled={loading}>
              Pulisci
            </Button>
          </div>
        </div>

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mt-4" aria-live="polite">
            {getAlertIcon(message.type)}
            <AlertTitle>{message.type === 'error' ? 'Errore' : message.type === 'warning' ? 'Attenzione' : 'Info'}</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {matchSections.length > 0 && (
          <div className="mt-4 space-y-4">
            {matchSections.map((section, index) => (
              <div key={`${section.title}-${index}`} className="space-y-2">
                <div>
                  <p className="text-sm font-semibold">{section.title}</p>
                  {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
                </div>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <Card key={`${section.title}-${item.id}`} className="p-3 bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <p className="font-medium">{item.fullName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Phone className="h-4 w-4" />
                        <p>{item.phone || "N/D"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">ID Cliente: {item.id}</p>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
