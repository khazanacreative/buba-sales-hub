import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Role } from "@/lib/types";

interface Props {
  adminOnly?: boolean;
  allowedRoles?: Role[];
}

export default function ProtectedRoute({ adminOnly, allowedRoles }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/welcome" replace />;

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
