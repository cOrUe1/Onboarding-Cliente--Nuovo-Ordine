"use client";

import { useState } from "react";
import CustomerSearch from "@/components/CustomerSearch";
import OrderList from "@/components/OrderList";
import { MadeWithDyad } from "@/components/made-with-dyad";

interface Customer {
  customerKey: string;
  fullName: string;
  phones: string[];
  ordersCount: number;
}

const Index = () => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const handleBackToSearch = () => {
    setSelectedCustomer(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />

      {/* Hero Section - Replicating the original HTML's header */}
      <div className="w-full max-w-md mx-auto mb-6 p-5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <h1 className="text-center font-bold text-xl md:text-2xl text-gray-900 dark:text-gray-100 mb-2">
          Report Montaggio – Seleziona cliente e ordine
        </h1>
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Cerca per Nome / Cognome / Telefono. Poi scegli l'ordine da aggiornare.
        </p>
      </div>

      {selectedCustomer ? (
        <OrderList customer={selectedCustomer} onBack={handleBackToSearch} />
      ) : (
        <CustomerSearch onCustomerSelect={handleCustomerSelect} />
      )}
      <MadeWithDyad />
    </div>
  );
};

export default Index;