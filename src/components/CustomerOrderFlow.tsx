"use client";

import React, { useState } from "react";
import CustomerSearch from "./CustomerSearch";
import OrderList from "./OrderList";
import Gatekeeper1Form from "./Gatekeeper1Form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

interface Customer {
  customerKey: string;
  fullName: string;
  phones: string[];
  ordersCount: number;
}

type View = "search" | "orders" | "newCustomer";

const CustomerOrderFlow: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>("search");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCurrentView("orders");
  };

  const handleBackToSearch = () => {
    setSelectedCustomer(null);
    setCurrentView("search");
  };

  const handleSwitchToNewCustomer = () => {
    setCurrentView("newCustomer");
  };

  const handleBackFromNewCustomer = () => {
    setCurrentView("search");
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {currentView === "search" && (
        <>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-center text-xl md:text-2xl">Cerca Cliente Esistente</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerSearch onCustomerSelect={handleCustomerSelect} />
            </CardContent>
          </Card>
          <div className="text-center">
            <Button onClick={handleSwitchToNewCustomer} className="w-full btn">
              <PlusCircle className="mr-2 h-4 w-4" /> Inserisci Nuovo Cliente/Ordine
            </Button>
          </div>
        </>
      )}

      {currentView === "orders" && selectedCustomer && (
        <OrderList customer={selectedCustomer} onBack={handleBackToSearch} />
      )}

      {currentView === "newCustomer" && (
        <Gatekeeper1Form onBack={handleBackFromNewCustomer} onSuggestSearch={handleBackToSearch} />
      )}
    </div>
  );
};

export default CustomerOrderFlow;