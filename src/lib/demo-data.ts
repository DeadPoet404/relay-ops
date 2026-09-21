export type ExceptionStatus =
  | "needs_review"
  | "retry_scheduled"
  | "investigating"
  | "resolved";
export type FailureKind =
  | "address_rejected"
  | "warehouse_unavailable"
  | "acknowledgement_unknown";
export type QueueFilter =
  | "open"
  | "needs_review"
  | "retry_scheduled"
  | "resolved";

export interface TimelineEvent {
  id: string;
  time: string;
  occurredAt?: string;
  title: string;
  description: string;
  tone: "neutral" | "warning" | "success";
}

export interface OrderException {
  id: string;
  orderNumber: string;
  customer: string;
  initials: string;
  email: string;
  items: number;
  amountCents: number;
  status: ExceptionStatus;
  kind: FailureKind;
  ageMinutes: number;
  openedAt: string;
  openedAtIso?: string;
  description: string;
  nextStep: string;
  reference: string;
  events: TimelineEvent[];
}

export const DEMO_SNAPSHOT = "20 Sep 2026 · 10:00 UTC";

export const statusLabels: Record<ExceptionStatus, string> = {
  needs_review: "Needs review",
  retry_scheduled: "Retry scheduled",
  investigating: "Checking status",
  resolved: "Resolved",
};

export const failureLabels: Record<FailureKind, string> = {
  address_rejected: "Address rejected",
  warehouse_unavailable: "Warehouse unavailable",
  acknowledgement_unknown: "Acknowledgement unknown",
};

export const scenarioDetails: Record<
  FailureKind,
  { description: string; nextStep: string }
> = {
  address_rejected: {
    description:
      "The simulated warehouse rejected the shipping address. This is a confirmed rejection, not a transient connection failure. The order has not been accepted for fulfillment.",
    nextStep:
      "An operator would verify and correct the address before submitting a new request. Repeatedly retrying the unchanged request will not help.",
  },
  warehouse_unavailable: {
    description:
      "The simulated warehouse returned a temporary service-unavailable response. The fixture represents a connector that supports idempotent submissions; no retry is actually running in this increment.",
    nextStep:
      "The future worker will retry with backoff, reusing the same idempotency key. It will escalate after the retry budget is exhausted.",
  },
  acknowledgement_unknown: {
    description:
      "The fulfillment request timed out after submission. The warehouse may already have accepted it. A timeout alone cannot tell us whether the order is safe to resubmit.",
    nextStep:
      "Look up the existing request by its external reference before retrying. If the connector cannot establish the outcome, escalate to a person instead of risking duplicate fulfillment.",
  },
};

function clock(minutesBeforeSnapshot: number) {
  const date = new Date(Date.UTC(2026, 8, 20, 10, -minutesBeforeSnapshot));
  return date.toISOString().slice(11, 16);
}

function makeOrder(
  orderNumber: string,
  customer: string,
  amountCents: number,
  items: number,
  kind: FailureKind,
  status: ExceptionStatus,
  ageMinutes: number,
): OrderException {
  const id = `exc-${orderNumber}`;
  const reference = `northline-${orderNumber}-fulfillment-v1`;
  const resolved = status === "resolved";
  const events: TimelineEvent[] = [
    {
      id: `${id}-1`,
      time: clock(ageMinutes + 2),
      title: "Payment confirmed",
      description: "Fixture event · Order is eligible for fulfillment.",
      tone: "neutral",
    },
    {
      id: `${id}-2`,
      time: clock(ageMinutes + 1),
      title: "Fulfillment request submitted",
      description: `Simulated connector · Reference ${reference}`,
      tone: "neutral",
    },
    {
      id: `${id}-3`,
      time: clock(ageMinutes),
      title: failureLabels[kind],
      description:
        kind === "address_rejected"
          ? "Simulated response: 422 · Shipping postcode is invalid."
          : kind === "warehouse_unavailable"
            ? "Simulated response: 503 · Temporary service outage."
            : "Simulated response: request timeout · Outcome is not established.",
      tone: "warning",
    },
  ];
  if (resolved) {
    events.push({
      id: `${id}-4`,
      time: clock(ageMinutes - 4),
      title: "Existing fulfillment found",
      description:
        "Fixture lookup matched the external reference. No duplicate submission was made.",
      tone: "success",
    });
  } else if (status === "retry_scheduled") {
    events.push({
      id: `${id}-4`,
      time: clock(ageMinutes - 1),
      title: "Retry scheduled · fixture only",
      description:
        "Example retry policy: exponential backoff with jitter. No worker is connected yet.",
      tone: "neutral",
    });
  } else if (status === "investigating") {
    events.push({
      id: `${id}-4`,
      time: clock(ageMinutes - 1),
      title: "Status lookup pending · fixture only",
      description:
        "Resubmission is blocked until the original request outcome is known.",
      tone: "neutral",
    });
  }
  return {
    id,
    orderNumber,
    customer,
    initials: customer
      .split(" ")
      .map((part) => part[0])
      .join(""),
    email: `${customer.toLowerCase().replaceAll(" ", ".")}@example.com`,
    amountCents,
    items,
    kind,
    status,
    ageMinutes,
    reference,
    openedAt: clock(ageMinutes),
    ...scenarioDetails[kind],
    nextStep: resolved
      ? "No further action in this example. The order was linked to its existing warehouse record after a reference lookup."
      : scenarioDetails[kind].nextStep,
    events,
  };
}

// Fictional people, orders, and connector responses. No live customer data.
export const demoOrders: OrderException[] = [
  makeOrder(
    "10482",
    "Jordan Lee",
    14800,
    2,
    "acknowledgement_unknown",
    "needs_review",
    84,
  ),
  makeOrder(
    "10479",
    "Amara Mensah",
    8900,
    1,
    "address_rejected",
    "needs_review",
    72,
  ),
  makeOrder(
    "10485",
    "Alex Morgan",
    21600,
    3,
    "warehouse_unavailable",
    "retry_scheduled",
    46,
  ),
  makeOrder(
    "10488",
    "Sam Rivera",
    6400,
    1,
    "acknowledgement_unknown",
    "investigating",
    38,
  ),
  makeOrder(
    "10491",
    "Taylor Kim",
    17200,
    2,
    "address_rejected",
    "needs_review",
    31,
  ),
  makeOrder(
    "10493",
    "Noah Brooks",
    11200,
    2,
    "warehouse_unavailable",
    "retry_scheduled",
    24,
  ),
  makeOrder(
    "10496",
    "Ellis Parker",
    5800,
    1,
    "warehouse_unavailable",
    "retry_scheduled",
    16,
  ),
  makeOrder(
    "10498",
    "Maya Chen",
    24500,
    3,
    "acknowledgement_unknown",
    "investigating",
    9,
  ),
  makeOrder(
    "10473",
    "Robin Ellis",
    9600,
    2,
    "acknowledgement_unknown",
    "resolved",
    120,
  ),
  makeOrder(
    "10468",
    "Casey James",
    13200,
    2,
    "acknowledgement_unknown",
    "resolved",
    145,
  ),
];

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatAge(minutes: number) {
  if (minutes >= 1440)
    return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

export function filterOrders(
  orders: OrderException[],
  filter: QueueFilter,
  query: string,
  kind: FailureKind | "all",
) {
  const normalizedQuery = query.trim().toLowerCase();
  return orders.filter((order) => {
    const matchesStatus =
      filter === "open" ? order.status !== "resolved" : order.status === filter;
    const matchesKind = kind === "all" || order.kind === kind;
    const haystack =
      `${order.orderNumber} #${order.orderNumber} ${order.customer} ${order.email} ${failureLabels[order.kind]}`.toLowerCase();
    return matchesStatus && matchesKind && haystack.includes(normalizedQuery);
  });
}
