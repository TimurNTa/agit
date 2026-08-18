export type MapTask = {
  id: string;
  address: string;
  lat: number;
  lon: number;
  status: "TODO" | "ACTIVE" | "SUBMITTED" | "ACCEPTED" | "REJECTED";
  note?: string | null;
  routeOrder?: number | null;
  rejectionReason?: string | null;
};
