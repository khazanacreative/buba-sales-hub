import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

interface Props {
  adminOnly?: boolean;
}

export default function ProtectedRoute({ adminOnly }: Props) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/welcome" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}
