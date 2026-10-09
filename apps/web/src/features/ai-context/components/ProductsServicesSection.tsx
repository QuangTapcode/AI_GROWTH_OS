import React from "react";
import type { ProductItem, ServiceItem } from "../types";
import styles from "../AiContextTab.module.css";

interface ProductsServicesSectionProps {
  products: ProductItem[];
  services: ServiceItem[];
  onAddProduct: () => void;
  onAddService: () => void;
}

export function ProductsServicesSection({
  products,
  services,
  onAddProduct,
  onAddService,
}: ProductsServicesSectionProps) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Products & services</h3>
        </div>

        <div className={styles.multiActionWrap}>
          <button
            type="button"
            className={styles.cardActionBtn}
            onClick={onAddProduct}
          >
            + Add product
          </button>
          <span>·</span>
          <button
            type="button"
            className={styles.cardActionBtn}
            onClick={onAddService}
          >
            + Add service
          </button>
        </div>
      </div>

      {/* Product Items */}
      {products.map((prod) => (
        <div key={prod.id} className={styles.itemCard}>
          <div className={styles.itemTopRow}>
            <span className={styles.itemBadgeProduct}>{prod.type}</span>
            <span className={styles.itemPrice}>{prod.price}</span>
          </div>
          <h4 className={styles.itemTitle}>{prod.title}</h4>
          <p className={styles.itemDesc}>{prod.description}</p>

          <div className={styles.uspBlock}>
            <span className={styles.uspLabel}>Key USPs</span>
            <div className={styles.pillsRow}>
              {prod.usps.map((usp, idx) => (
                <span key={idx} className={styles.uspPill}>
                  {usp}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Service Items */}
      {services.map((serv) => (
        <div key={serv.id} className={styles.itemCard}>
          <div className={styles.itemTopRow}>
            <span className={styles.itemBadgeService}>{serv.type}</span>
          </div>
          <h4 className={styles.itemTitle}>{serv.title}</h4>
          <p className={styles.itemDesc}>{serv.description}</p>
          <div className={styles.targetPersonaLine}>
            Target persona:
            <span className={styles.targetPersonaVal}>{serv.targetPersona}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
