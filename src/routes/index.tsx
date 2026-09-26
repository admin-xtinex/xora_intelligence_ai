import { createFileRoute } from "@tanstack/react-router";
import { LedgerDashboard } from "@/components/ledger-dashboard";

export const Route = createFileRoute("/")({ component: LedgerDashboard });
