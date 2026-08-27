import { count, eq } from "drizzle-orm";
import { db, orders } from "@workspace/db";

type DashboardActor = {
  role: "ADMIN" | "REPRESENTATIVE";
  representativeId?: string;
};

export type DashboardSummary = {
  draft_count: number;
  submitted_count: number;
  approved_count: number;
  invoiced_count: number;
  rejected_count: number;
};

const emptySummary = (): DashboardSummary => ({
  draft_count: 0,
  submitted_count: 0,
  approved_count: 0,
  invoiced_count: 0,
  rejected_count: 0,
});

export class DbDashboardService {
  async summary(actor: DashboardActor): Promise<DashboardSummary> {
    // A representative without an active ERP link cannot own orders. Returning
    // an empty summary prevents the unscoped admin view from leaking to them.
    if (actor.role === "REPRESENTATIVE" && !actor.representativeId) {
      return emptySummary();
    }

    const rows = await db
      .select({
        internalStatus: orders.internalStatus,
        erpStatus: orders.erpStatus,
        value: count(),
      })
      .from(orders)
      .where(
        actor.role === "REPRESENTATIVE"
          ? eq(orders.representativeId, actor.representativeId!)
          : undefined,
      )
      .groupBy(orders.internalStatus, orders.erpStatus);

    return rows.reduce<DashboardSummary>((summary, row) => {
      if (row.internalStatus === "DRAFT") {
        summary.draft_count += row.value;
        return summary;
      }

      switch (row.erpStatus) {
        case "APROVADO":
        case "FECHADO":
          summary.approved_count += row.value;
          break;
        case "FATURADO":
          summary.invoiced_count += row.value;
          break;
        case "REPROVADO":
          summary.rejected_count += row.value;
          break;
        // A submitted order has no ERP status until it is confirmed. Both that
        // state and EM_ANALISE remain visible as "Enviados".
        default:
          summary.submitted_count += row.value;
      }
      return summary;
    }, emptySummary());
  }
}

export const dashboardService = new DbDashboardService();