import seal from "../assets/barangay-seal.png";

interface BarangayLogoProps {
  className?: string;
}

export function BarangayLogo({ className }: BarangayLogoProps) {
  return (
    <img
      className={className}
      src={seal}
      alt="Municipality of San Miguel, Bohol seal used by Barangay Mahayag"
    />
  );
}
