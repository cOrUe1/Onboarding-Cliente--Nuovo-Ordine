"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOrdersGK1, makePrefillUrlGK1 } from "@/api/gatekeeper1";
import { Loader2, ExternalLink, ArrowLeft, Info, TriangleAlert, CircleX } from "lucide-react"; // Import icons for alerts
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components

interface Customer {
  customerKey: string;
  fullName: string;
  phones: string[];
  ordersCount: number;
}

interface Order {
  orderId: string;
  label: string;
}

interface OrderListProps {
  customer: Customer;
  onBack: () => void;
  onNewOrder?: () => void;
}

const OrderList: React.FC<OrderListProps> = ({ customer, onBack, onNewOrder }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setMessage(null);
      setLoading(true);
      setMessage({ type: 'info', text: "Caricamento ordini…" });
      try {
        const fetchedOrders = await getOrdersGK1(customer.customerKey);
        // Mappa gli ordini recuperati per corrispondere all'interfaccia Order
        const mappedOrders = fetchedOrders.map((order: { id: string; title: string }) => ({
          orderId: order.id,
          label: order.title,
        }));
        setOrders(mappedOrders);
        if (mappedOrders.length === 0) {
          setMessage({ type: 'info', text: "Nessun ordine associato a questo cliente." });
        } else {
          setMessage(null); // Clear message if orders are found
        }
      } catch (error) {
        console.error("Errore durante il recupero degli ordini:", error);
        setMessage({ type: 'error', text: "Si è verificato un errore durante il recupero degli ordini. Riprova più tardi." });
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [customer.customerKey]);

  const handleOpenForm = async (order: Order) => {
    setMessage({ type: 'info', text: "Apertura modulo…" });
    try {
      // Apri Modulo 1 (GK1) come cliente esistente
      const [firstName, ...rest] = customer.fullName.split(' ');
      const lastName = rest.join(' ');
      const phone = customer.phones?.[0] || '';

      const prefillUrl = await makePrefillUrlGK1({
        firstName: firstName || '',
        lastName: lastName || '',
        phone,
        newCustomer: 'No',
        customerId: customer.customerKey,
      });

      console.log("Generated Prefill URL:", prefillUrl); // Log per debug

      if (prefillUrl) {
        if (window.top) { // Check if window.top is not null
          window.top.location.assign(prefillUrl);
        } else {
          // Fallback if window.top is null (e.g., in a standalone browser window)
          window.location.assign(prefillUrl);
        }
      } else {
        throw new Error("URL precompilato non generato.");
      }
    } catch (error) {
      console.error("Errore durante la generazione o l'apertura dell'URL del modulo:", error);
      setMessage({ type: 'error', text: "Impossibile aprire il modulo precompilato. Riprova." });
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
        <CardTitle className="text-center text-xl md:text-2xl flex-grow">Ordini di {customer.fullName}</CardTitle>
        <div className="w-10"></div> {/* Placeholder for alignment */}
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="text-xs text-muted-foreground">
          ID cliente base: <span className="font-mono">{customer.customerKey}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Gli ID degli ordini includono il suffisso finale (es. <span className="font-mono">{customer.customerKey}_02</span>).
        </div>
        {loading && (
          <div className="flex justify-center items-center">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            <p>Caricamento ordini...</p>
          </div>
        )}

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mt-4" aria-live="polite">
            {getAlertIcon(message.type)}
            <AlertTitle>{message.type === 'error' ? 'Errore' : message.type === 'warning' ? 'Attenzione' : 'Info'}</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {!loading && orders.length > 0 && (
          <div className="space-y-2">
            {orders.map((order) => (
              <Card key={order.orderId} className="p-2">
                <CardContent className="p-2">
                  <p className="font-medium text-base">{order.label}</p>
                  <p className="text-sm text-muted-foreground">ID Ordine: {order.orderId}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {onNewOrder && (
          <div className="mt-4 pt-4 border-t">
            <Button onClick={onNewOrder} className="w-full btn">
              Nuovo Ordine per {customer.fullName} <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderList;
