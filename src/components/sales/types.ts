import type { Database } from "@/integrations/supabase/types";

// Shared types for the Sales route and its extracted presentational components.
// These intentionally mirror the loosely-typed Supabase query shapes used by
// src/routes/_authenticated/sales.tsx so behavior/data flow stays identical.

export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export interface LookupOption {
  id: string;
  name?: string | null;
}

export interface CustomerRecord {
  id: string;
  name?: string | null;
  company?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SaleReceipt {
  id: string;
  file_path: string;
  amount: number;
  paid_at: string;
  notes?: string | null;
}

export interface SaleCustomer {
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
}

export interface SaleRecord {
  id: string;
  sale_date: string;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  seller_id?: string | null;
  producer_id?: string | null;
  service_type_id?: string | null;
  package_id?: string | null;
  package_name?: string | null;
  service_quantity?: number | null;
  notes?: string | null;
  google_drive_link?: string | null;
  trello_link?: string | null;
  platform_link?: string | null;
  lead_source?: string | null;
  delivery_deadline?: string | null;
  expected_delivery_date?: string | null;
  video_duration_seconds?: number | null;
  installments?: string | number | null;
  pagarme_id?: string | null;
  customer_id?: string | null;
  customers?: SaleCustomer | null;
  sellers?: { name?: string | null } | null;
  producers?: { name?: string | null } | null;
  service_types?: { name?: string | null } | null;
  sale_receipts?: SaleReceipt[] | null;
}

export interface EditingSale extends SaleRecord {
  customer_name?: string;
  company?: string;
  document?: string;
  phone?: string;
  email?: string;
  with_invoice?: string;
}

export interface SaleFormState {
  customer_name: string;
  company: string;
  document: string;
  phone: string;
  email: string;
  total_amount: string;
  paid_amount: string;
  payment_status: string;
  payment_method: string;
  seller_id: string;
  producer_id: string;
  service_type_id: string;
  package_id: string;
  package_name: string;
  service_quantity: string;
  notes: string;
  google_drive_link: string;
  platform_link: string;
  sale_date: string;
  lead_source: string;
  with_invoice: string;
  installments: string;
  delivery_deadline: string;
  expected_delivery_date: string;
  video_duration_seconds: string;
}
