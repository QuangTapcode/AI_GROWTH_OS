import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (product: {
    title: string;
    price: string;
    description: string;
  }) => void;
}

export function AddProductModal({ isOpen, onClose, onAdd }: AddProductModalProps) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      price: price.trim(),
      description: desc.trim(),
    });
    setTitle("");
    setPrice("");
    setDesc("");
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add Product</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Product Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Da Nang Food & Drink Pass"
                className={styles.formInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Price (Optional)</label>
              <input
                type="text"
                placeholder="e.g. From $30"
                className={styles.formInput}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                rows={3}
                placeholder="Describe what is offered..."
                className={styles.formTextarea}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Add Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
