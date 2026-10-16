// Shapes returned by the API, shared by the dashboard screens.
export interface ServiceRequest {
  request_id: number;
  resident_id: number;
  doc_type_id: number;
  committee_id: number;
  status: string;
  reference_number: string | null;
  date_requested: string;
}
export interface Incident {
  incident_id: number;
  committee_id: number;
  location: string;
  description: string;
  status: string;
  date_filed: string;
}
export interface Budget {
  budget_id: number;
  committee_id: number;
  fiscal_year: string;
  allocated_amount: string | number;
  remaining_amount: string | number;
}
export interface Committee {
  committee_id: number;
  committee_name: string;
}
export interface DocType {
  doc_type_id: number;
  name: string;
}
export interface Person {
  resident_id: number;
  first_name: string;
  last_name: string;
  resident_status: string;
}
export interface Assignment {
  assignment_id: number;
  staff_id: number;
  committee_id: number;
  role: string;
}
export interface UserAccount {
  user_id: number;
  username: string;
  resident_id: number | null;
}
export interface AuditEntry {
  audit_id: string;
  changed_by_user_id: number | null;
  table_name: string;
  record_id: number;
  action_type: string;
  logged_at: string;
}

export const OPEN_REQUEST = ["Pending", "Processing", "Approved"];
export const CLOSED_INCIDENT = ["Settled", "Closed"];

export const peso = (value: string | number) =>
  Number(value).toLocaleString("en-PH", { style: "currency", currency: "PHP" });

export const statusClass = (status: string) =>
  `status status-${status.toLowerCase().replace(/\s+/g, "-")}`;
