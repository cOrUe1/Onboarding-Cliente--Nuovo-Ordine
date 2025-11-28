"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { searchCustomers } from "@/api/gatekeeper";
import { Loader2, Phone, User, Info, TriangleAlert, CircleX } from "lucide-react"; // Import icons for alerts
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components

interface Customer {
  customerKey: string;
  fullName: string;
  phones: string[];
  ordersCount: number;
}

interface CustomerSearchProps {
  onCustomerSelect: (customer: Customer) => void;
}

const CustomerSearch: React.FC<CustomerSearchProps> = ({ onCustomerSelect }) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);

  const handleSearch = async () => {
    setMessage(null);
    setSearchResults([]);

    const query = { firstName, lastName, phone };

    const hasFirstName = firstName.trim().length >= 2;
    const hasLastName = lastName.trim().length >= 2;
    const hasPhone = phone.replace(/\D/g, '').length >= 3;

    if (!hasFirstName && !hasLastName && !hasPhone) {
      setMessage({ type: 'error', text: "Inserisci almeno 2 lettere per nome/cognome o 3 cifre per il telefono." });
      return;
    }

    setLoading(true);
    setMessage({ type: 'info', text: "Ricerca in corso…" });
    try {
      const results = await searchCustomers(query);
      setSearchResults(results);
      if (results.length === 0) {
        setMessage({ type: 'error', text: "Nessun cliente trovato. Prova a ridurre i filtri o usa solo nome/cognome oppure solo telefono." });
      } else {
        setMessage({ type: 'info', text: `Trovati ${results.length} clienti compatibili.` });
      }
    } catch (error) {
      console.error("Errore durante la ricerca clienti:", error);
      setMessage({ type: 'error', text: "Si è verificato un errore durante la ricerca dei clienti. Riprova più tardi." });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setSearchResults([]);
    setMessage(null);
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
        <CardTitle className="text-center text-xl md:text-2xl">Cerca Cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <Input
          type="text"
          placeholder="Nome"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="input"
        />
        <Input
          type="text"
          placeholder="Cognome"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="input"
        />
        <Input
          type="tel"
          placeholder="333 123 4567" // Updated placeholder
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="input"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleSearch} disabled={loading} className="w-full btn">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search mr-2 h-4 w-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Cerca</span>}
          </Button>
          <Button onClick={handleClear} variant="outline" className="w-full btn">
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

        {searchResults.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="text-lg font-semibold">Risultati Ricerca:</h3>
            {searchResults.map((customer) => (
              <Card
                key={customer.customerKey}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => onCustomerSelect(customer)}
              >
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <p className="font-medium">{customer.fullName}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <p>{customer.phones.join(", ")}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ordini: <span className="font-semibold">{customer.ordersCount}</span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomerSearch;