"use client";

import React, { useState } from "react";
import styles from "./AiContextTab.module.css";
import {
  INITIAL_BUSINESS,
  INITIAL_PRODUCTS,
  INITIAL_SERVICES,
  INITIAL_AUDIENCE,
  INITIAL_LOCATIONS,
  INITIAL_COMPETITORS,
  INITIAL_BRAND,
} from "./constants";
import type {
  ProductItem,
  ServiceItem,
  LocationItem,
  CompetitorItem,
  AudienceData,
  BrandContextData,
} from "./types";
import { AiContextHeaderCard } from "./components/AiContextHeaderCard";
import { BusinessContextSection } from "./components/BusinessContextSection";
import { ProductsServicesSection } from "./components/ProductsServicesSection";
import { TargetAudienceSection } from "./components/TargetAudienceSection";
import { LocationsSection } from "./components/LocationsSection";
import { CompetitorsSection } from "./components/CompetitorsSection";
import { BrandContextSection } from "./components/BrandContextSection";
import { AiRulesSection } from "./components/AiRulesSection";
import { EditBusinessModal } from "./components/modals/EditBusinessModal";
import { AddProductModal } from "./components/modals/AddProductModal";
import { AddServiceModal } from "./components/modals/AddServiceModal";
import { AddAudienceModal } from "./components/modals/AddAudienceModal";
import { AddLocationModal } from "./components/modals/AddLocationModal";
import { AddCompetitorModal } from "./components/modals/AddCompetitorModal";
import { EditBrandModal } from "./components/modals/EditBrandModal";

export default function AiContextTab() {
  // Domain States
  const [industry, setIndustry] = useState(INITIAL_BUSINESS.industry);
  const [businessOverview, setBusinessOverview] = useState(INITIAL_BUSINESS.overview);
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [services, setServices] = useState<ServiceItem[]>(INITIAL_SERVICES);
  const [audience, setAudience] = useState<AudienceData>(INITIAL_AUDIENCE);
  const [locations, setLocations] = useState<LocationItem[]>(INITIAL_LOCATIONS);
  const [competitors, setCompetitors] = useState<CompetitorItem[]>(INITIAL_COMPETITORS);
  const [brand, setBrand] = useState<BrandContextData>(INITIAL_BRAND);

  // Modal active state
  const [activeModal, setActiveModal] = useState<
    | "edit-business"
    | "add-product"
    | "add-service"
    | "add-audience"
    | "add-location"
    | "add-competitor"
    | "edit-brand"
    | null
  >(null);

  return (
    <div className={styles.container}>
      {/* 1. Header */}
      <AiContextHeaderCard onEdit={() => setActiveModal("edit-business")} />

      {/* 2. Business Context */}
      <BusinessContextSection
        industry={industry}
        businessOverview={businessOverview}
      />

      {/* 3. Products & Services + Target Audience (2 Columns) */}
      <div className={styles.twoColGrid}>
        <ProductsServicesSection
          products={products}
          services={services}
          onAddProduct={() => setActiveModal("add-product")}
          onAddService={() => setActiveModal("add-service")}
        />

        <TargetAudienceSection
          audienceTitle={audience.title}
          demographics={audience.demographics}
          painPoints={audience.painPoints}
          interests={audience.interests}
          onAddAudience={() => setActiveModal("add-audience")}
        />
      </div>

      {/* 4. Bottom Grid: Left Stack + Right AI Rules */}
      <div className={styles.bottomSectionGrid}>
        <div className={styles.leftColumnStack}>
          <div className={styles.locationsCompetitorsGrid}>
            <LocationsSection
              locations={locations}
              onAddLocation={() => setActiveModal("add-location")}
            />
            <CompetitorsSection
              competitors={competitors}
              onAddCompetitor={() => setActiveModal("add-competitor")}
            />
          </div>

          <BrandContextSection
            brandVoice={brand.brandVoice}
            tone={brand.tone}
            brandGuidelines={brand.guidelines}
            forbiddenTerms={brand.forbiddenTerms}
            onEditBrand={() => setActiveModal("edit-brand")}
          />
        </div>

        <AiRulesSection />
      </div>

      {/* 5. Modals */}
      {activeModal === "edit-business" && (
        <EditBusinessModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          initialIndustry={industry}
          initialOverview={businessOverview}
          onSave={(newInd, newOver) => {
            setIndustry(newInd);
            setBusinessOverview(newOver);
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === "add-product" && (
        <AddProductModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          onAdd={({ title, price, description }) => {
            setProducts((prev) => [
              ...prev,
              {
                id: `p-${Date.now()}`,
                type: "Product",
                price: price || "From $20",
                title,
                description: description || "Access curated experiences across Da Nang.",
                usps: ["Verified partners", "Instant booking", "Local guide"],
              },
            ]);
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === "add-service" && (
        <AddServiceModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          onAdd={({ title, targetPersona, description }) => {
            setServices((prev) => [
              ...prev,
              {
                id: `s-${Date.now()}`,
                type: "Service",
                title,
                description: description || "High quality service tailored for guests.",
                targetPersona: targetPersona || "Visitors staying in Da Nang",
              },
            ]);
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === "add-audience" && (
        <AddAudienceModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          initialTitle={audience.title}
          initialDemographics={audience.demographics}
          onSave={({ title, demographics, painPoint, interest }) => {
            setAudience((prev) => ({
              title: title || prev.title,
              demographics: demographics || prev.demographics,
              painPoints: painPoint ? [...prev.painPoints, painPoint] : prev.painPoints,
              interests: interest ? [...prev.interests, interest] : prev.interests,
            }));
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === "add-location" && (
        <AddLocationModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          onAdd={(name) => {
            setLocations((prev) => [
              ...prev,
              { id: `loc-${Date.now()}`, name, isPrimary: false },
            ]);
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === "add-competitor" && (
        <AddCompetitorModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          onAdd={({ name, url, description }) => {
            setCompetitors((prev) => [
              ...prev,
              {
                id: `c-${Date.now()}`,
                name,
                url,
                description,
              },
            ]);
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === "edit-brand" && (
        <EditBrandModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          initialBrandVoice={brand.brandVoice}
          initialTone={brand.tone}
          initialGuidelines={brand.guidelines}
          onSave={({ brandVoice, tone, guidelines, forbiddenTerm }) => {
            setBrand((prev) => ({
              brandVoice,
              tone,
              guidelines,
              forbiddenTerms: forbiddenTerm
                ? [...prev.forbiddenTerms, `"${forbiddenTerm}"`]
                : prev.forbiddenTerms,
            }));
            setActiveModal(null);
          }}
        />
      )}
    </div>
  );
}
