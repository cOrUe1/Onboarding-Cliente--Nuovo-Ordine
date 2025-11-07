"use client";

import Gatekeeper1Form from "@/components/Gatekeeper1Form";
import { MadeWithDyad } from "@/components/made-with-dyad";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />

      {/* Hero Section */}
      <div className="w-full max-w-md mx-auto mb-6 p-5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <h1 className="text-center font-bold text-xl md:text-2xl text-gray-900 dark:text-gray-100 mb-2">
          Gatekeeper Modulo 1
        </h1>
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Inserisci un nuovo cliente o cerca un cliente esistente.
        </p>
      </div>

      <Gatekeeper1Form />
      <MadeWithDyad />
    </div>
  );
};

export default Index;
