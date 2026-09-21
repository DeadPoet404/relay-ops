"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FlaskConical,
  Inbox,
  Info,
  Link2,
  ListFilter,
  LoaderCircle,
  Menu,
  PackageCheck,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  failureLabels,
  filterOrders,
  formatAge,
  formatMoney,
  statusLabels,
  type FailureKind,
  type OrderException,
  type QueueFilter,
} from "@/lib/demo-data";

import { snapshotLabel, type ConsoleData } from "@/lib/console-data";

import { ExecutionLab } from "./execution-lab";

type View = "exceptions" | "activity" | "connections" | "demo";
const navigation = [
  { id: "exceptions", label: "Exceptions", icon: Inbox },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "connections", label: "Connections", icon: Link2 },
] as const;

function StatusBadge({ status }: { status: OrderException["status"] }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span>
        relay<span className="brand-period">.</span>
      </span>
    </div>
  );
}

export function RelayConsole({ data: initialData }: { data: ConsoleData }) {
  const [data, setData] = useState(initialData);
  const demoOrders = data.orders;
  const persisted = data.source === "database";
  const exampleOrder = demoOrders.find(
    (order) =>
      order.kind === "acknowledgement_unknown" && order.status !== "resolved",
  );
  const openOrders = demoOrders.filter((order) => order.status !== "resolved");
  const reviewCount = demoOrders.filter(
    (order) => order.status === "needs_review",
  ).length;
  const retryCount = demoOrders.filter(
    (order) => order.status === "retry_scheduled",
  ).length;
  const resolvedCount = demoOrders.filter(
    (order) => order.status === "resolved",
  ).length;
  const openValue = openOrders.reduce(
    (total, order) => total + order.amountCents,
    0,
  );

  const orderTrigger = useRef<HTMLElement | null>(null);
  const aboutTrigger = useRef<HTMLElement | null>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState<View>("exceptions");
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FailureKind | "all">("all");
  const [oldestFirst, setOldestFirst] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderException | null>(
    null,
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const visibleOrders = filterOrders(demoOrders, filter, query, kind).sort(
    (a, b) =>
      oldestFirst ? b.ageMinutes - a.ageMinutes : a.ageMinutes - b.ageMinutes,
  );

  function openOrder(order: OrderException) {
    orderTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedOrder(order);
  }

  function openAbout() {
    aboutTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setAboutOpen(true);
  }

  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
  }

  function navigationContents() {
    return (
      <>
        <Brand />
        <div className="workspace">
          <span className="store-mark">N</span>
          <div>
            <strong>{data.storeName}</strong>
            <span>{persisted ? "Database demo" : "Fixture workspace"}</span>
          </div>
          <span className="workspace-dot" title="Fictional workspace" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="nav-links">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
              className={`nav-item ${view === id ? "active" : ""}`}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {id === "exceptions" && (
                <span className="nav-count">{openOrders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label tools-label">DEVELOPMENT</div>
        <button
          className={`nav-item ${view === "demo" ? "active" : ""}`}
          onClick={() => navigate("demo")}
          aria-current={view === "demo" ? "page" : undefined}
        >
          <FlaskConical size={18} strokeWidth={1.7} />
          <span>Demo lab</span>
          <span className="tiny-label">04</span>
        </button>
        <div className="sidebar-bottom">
          <div className="build-note">
            <span className="build-note-icon">
              <Box size={17} />
            </span>
            <strong>Small details. Safer orders.</strong>
            <p>
              A clear view of what needs
              <br />a second look.
            </p>
            <button onClick={openAbout}>
              About this build <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="operator">
            <div className="avatar operator-avatar">OP</div>
            <div>
              <strong>Operations preview</strong>
              <span>
                {data.labEnabled
                  ? "Local lab · fictional store"
                  : "Read-only · fictional store"}
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">{navigationContents()}</aside>
      <Dialog.Root open={mobileNav} onOpenChange={setMobileNav}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="mobile-nav"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              menuTrigger.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">
              Workspace navigation
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Choose a page in the Relay demo workspace.
            </Dialog.Description>
            <Dialog.Close
              className="icon-button mobile-close"
              aria-label="Close navigation"
            >
              <X size={20} />
            </Dialog.Close>
            {navigationContents()}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={menuTrigger}
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {view === "demo"
                ? "Demo lab"
                : navigation.find((item) => item.id === view)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              {persisted ? "Persisted demo" : "Fixture demo"}
            </span>
            <button
              className="icon-button"
              aria-label="About this demo"
              onClick={openAbout}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="demo-banner">
            <Info size={15} />
            <span>
              <strong>
                {persisted
                  ? "PostgreSQL connected. Still a fictional store."
                  : "Standalone fixture preview. No database connected."}
              </strong>{" "}
              Synthetic data only. No live customer orders.
            </span>
            <span className="banner-version">RECOVERY / 004</span>
          </div>
          {view === "exceptions" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">ORDER OPERATIONS</div>
                  <h1>Exceptions</h1>
                  <p>
                    Spot the hold-up. Understand the context. Find the next
                    step.
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => navigate("activity")}
                >
                  <Activity size={16} />
                  View activity
                  <ArrowUpRight size={15} />
                </button>
              </section>
              <section className="metric-grid" aria-label="Demo queue summary">
                <Metric
                  label="Open exceptions"
                  value={String(openOrders.length).padStart(2, "0")}
                  detail="Awaiting a confirmed outcome"
                  icon={<Inbox size={17} />}
                />
                <Metric
                  label="Needs your review"
                  value={String(reviewCount).padStart(2, "0")}
                  detail="A human decision is needed"
                  icon={<TriangleAlert size={17} />}
                  warning
                />
                <Metric
                  label="Retry scheduled"
                  value={String(retryCount).padStart(2, "0")}
                  detail="Includes fixed seed examples"
                  icon={<Clock3 size={17} />}
                />
                <Metric
                  label="Open order value"
                  value={formatMoney(openValue)}
                  detail="Order value, not estimated loss"
                  icon={<Box size={17} />}
                />
              </section>
              <section className="queue-panel" aria-labelledby="queue-heading">
                <div className="queue-heading">
                  <div>
                    <h2 id="queue-heading">
                      Your attention, where it matters.
                    </h2>
                    <p>One place for orders that need a second look.</p>
                  </div>
                  <span className="snapshot-label">
                    <Clock3 size={13} />
                    Snapshot · {data.snapshotAt.slice(11, 16)} UTC
                  </span>
                </div>
                <div
                  className="queue-tabs"
                  role="group"
                  aria-label="Filter by status"
                >
                  {(
                    [
                      {
                        id: "open",
                        label: "All open",
                        count: openOrders.length,
                      },
                      {
                        id: "needs_review",
                        label: "Needs review",
                        count: reviewCount,
                      },
                      {
                        id: "retry_scheduled",
                        label: "Retry scheduled",
                        count: retryCount,
                      },
                      {
                        id: "resolved",
                        label: "Resolved",
                        count: resolvedCount,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      aria-pressed={filter === tab.id}
                      className={`queue-tab ${filter === tab.id ? "selected" : ""}`}
                      onClick={() => setFilter(tab.id)}
                    >
                      {tab.label}
                      <span>{tab.count}</span>
                    </button>
                  ))}
                </div>
                <div className="queue-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <span className="sr-only">Search orders or customers</span>
                    <input
                      placeholder="Search orders or customers…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="filter-controls">
                    <label className="select-field">
                      <ListFilter size={15} />
                      <span className="sr-only">Exception type</span>
                      <select
                        value={kind}
                        onChange={(event) =>
                          setKind(event.target.value as FailureKind | "all")
                        }
                      >
                        <option value="all">All exception types</option>
                        {Object.entries(failureLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <button
                      className="button sort-button"
                      onClick={() => setOldestFirst(!oldestFirst)}
                    >
                      <ArrowDown
                        className={!oldestFirst ? "rotated" : ""}
                        size={14}
                      />
                      {oldestFirst ? "Oldest first" : "Newest first"}
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>Order / Customer</th>
                        <th>Exception</th>
                        <th>Status</th>
                        <th>Value</th>
                        <th>
                          {filter === "resolved" ? "Opened ago" : "Waiting"}
                        </th>
                        <th>
                          <span className="sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <div className="order-cell">
                              <span className="avatar">{order.initials}</span>
                              <div>
                                <button
                                  className="order-link"
                                  onClick={() => openOrder(order)}
                                >
                                  #{order.orderNumber}
                                </button>
                                <span className="customer-name">
                                  {order.customer}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="exception-cell">
                              <span
                                className={`exception-symbol ${order.kind === "address_rejected" ? "symbol-amber" : ""}`}
                              >
                                {order.kind === "warehouse_unavailable" ? (
                                  <Link2 size={15} />
                                ) : order.kind === "address_rejected" ? (
                                  <TriangleAlert size={15} />
                                ) : (
                                  <Clock3 size={15} />
                                )}
                              </span>
                              <div>
                                <span>{failureLabels[order.kind]}</span>
                                <small>
                                  {order.kind === "address_rejected"
                                    ? "Shipping details need attention"
                                    : order.kind === "warehouse_unavailable"
                                      ? "Temporary connector failure"
                                      : "Confirm before resubmitting"}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="money-cell">
                            {formatMoney(order.amountCents)}
                          </td>
                          <td>
                            <span
                              className={`age-value ${order.ageMinutes >= 60 && order.status !== "resolved" ? "age-warning" : ""}`}
                            >
                              {formatAge(order.ageMinutes)}
                            </span>
                          </td>
                          <td>
                            <button
                              className="row-arrow"
                              aria-label={`View order ${order.orderNumber}`}
                              onClick={() => openOrder(order)}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {visibleOrders.length === 0 && (
                  <div className="empty-state">
                    <Search size={24} />
                    <h3>No matching exceptions</h3>
                    <p>
                      Try a different order number, customer, or exception type.
                    </p>
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setQuery("");
                        setKind("all");
                        setFilter("open");
                      }}
                    >
                      Reset filters
                    </button>
                  </div>
                )}
                <div className="table-footer">
                  <span aria-live="polite">
                    Showing {visibleOrders.length}{" "}
                    {visibleOrders.length === 1 ? "exception" : "exceptions"}
                  </span>
                  <span>Fictional dataset · USD</span>
                </div>
              </section>
              <div className="safety-note">
                <ShieldCheck size={17} />
                <p>
                  <strong>Recovery starts with certainty.</strong> An unknown
                  outcome isn’t a failed order. Check before retrying.
                </p>
                <button
                  disabled={!exampleOrder}
                  onClick={() => {
                    if (exampleOrder) openOrder(exampleOrder);
                  }}
                >
                  Explore an example
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}
          {view === "activity" && (
            <ActivityView data={data} onSelect={openOrder} />
          )}
          {view === "connections" && <ConnectionsView source={data.source} />}
          {view === "demo" && (
            <DemoView
              orders={data.orders}
              onSelect={openOrder}
              enabled={data.labEnabled ?? false}
              onData={setData}
            />
          )}
          <footer className="page-footer">
            <span>
              RELAY <span className="footer-divider">/</span> BUILT FOR THE
              IN-BETWEEN
            </span>
            <span>{snapshotLabel(data.snapshotAt)}</span>
          </footer>
        </main>
      </div>
      <Dialog.Root
        open={selectedOrder !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="order-drawer"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              orderTrigger.current?.focus();
            }}
          >
            {selectedOrder && (
              <>
                <div className="drawer-header">
                  <div>
                    <span className="eyebrow">EXCEPTION DETAIL · DEMO</span>
                    <Dialog.Title>
                      Order #{selectedOrder.orderNumber}
                    </Dialog.Title>
                    <Dialog.Description>
                      {selectedOrder.customer} · {selectedOrder.items}{" "}
                      {selectedOrder.items === 1 ? "item" : "items"} ·{" "}
                      {formatMoney(selectedOrder.amountCents)} USD
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    className="icon-button"
                    aria-label="Close order details"
                  >
                    <X size={20} />
                  </Dialog.Close>
                </div>
                <div className="drawer-body">
                  <div className="drawer-status">
                    <StatusBadge status={selectedOrder.status} />
                    <span>Opened at {selectedOrder.openedAt} UTC</span>
                  </div>
                  <h3>{failureLabels[selectedOrder.kind]}</h3>
                  <p className="body-copy">{selectedOrder.description}</p>
                  <div className="next-step">
                    <span>
                      <ShieldCheck size={16} />
                      {selectedOrder.status === "resolved"
                        ? "Outcome in this example"
                        : "The safe next step"}
                    </span>
                    <p>{selectedOrder.nextStep}</p>
                  </div>
                  <div className="detail-grid">
                    <div>
                      <span>Store</span>
                      <strong>{data.storeName}</strong>
                    </div>
                    <div>
                      <span>Payment</span>
                      <strong className="payment-confirmed">
                        <Check size={13} />
                        Paid · demo
                      </strong>
                    </div>
                    <div className="full-width">
                      <span>External reference</span>
                      <code>{selectedOrder.reference}</code>
                    </div>
                  </div>
                  <div className="timeline-heading">
                    <h3>Order timeline</h3>
                    <span>Recorded events · UTC</span>
                  </div>
                  <ol className="timeline">
                    {selectedOrder.events.map((event) => (
                      <li key={event.id}>
                        <span className={`timeline-dot dot-${event.tone}`}>
                          {event.tone === "success" ? (
                            <Check size={11} />
                          ) : event.tone === "warning" ? (
                            <span>!</span>
                          ) : (
                            <span />
                          )}
                        </span>
                        <div>
                          <div className="event-heading">
                            <strong>{event.title}</strong>
                            <time dateTime={event.occurredAt}>
                              {event.occurredAt
                                ? `${event.occurredAt.slice(5, 10)} · ${event.time}`
                                : event.time}
                            </time>
                          </div>
                          <p>{event.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="drawer-bottom">
                  <div className="disabled-action-note">
                    <Info size={14} />
                    <span>Simulator only. No live warehouse is connected.</span>
                  </div>
                  <button className="button button-primary" disabled>
                    <ShieldCheck size={16} />
                    Inspect automatic recovery in the local Demo lab
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={aboutOpen} onOpenChange={setAboutOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="about-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (aboutTrigger.current?.isConnected)
                aboutTrigger.current.focus();
              else menuTrigger.current?.focus();
            }}
          >
            <Dialog.Close
              className="icon-button about-close"
              aria-label="Close about dialog"
            >
              <X size={20} />
            </Dialog.Close>
            <span className="about-mark">
              <ShieldCheck size={25} />
            </span>
            <div className="eyebrow">RELAY · INCREMENT 004</div>
            <Dialog.Title>
              A little clarity between
              <br />
              payment and fulfillment.
            </Dialog.Title>
            <Dialog.Description>
              Relay is an order exception and recovery console. This increment
              executes fictional orders through a durable worker and local
              warehouse simulator, recording uncertainty without blind
              resubmission.
            </Dialog.Description>
            <div className="about-facts">
              <p>
                <Check size={15} />
                Working search, filters, and order inspection
              </p>
              <p>
                <Check size={15} />
                {persisted
                  ? "Fictional records read from PostgreSQL"
                  : "Standalone TypeScript fixtures"}
              </p>
              <p>
                <Info size={15} />
                Local simulator only; no authentication or live integrations
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={() => setAboutOpen(false)}
            >
              Back to the workspace
              <ArrowRight size={16} />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  warning,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`metric-card ${warning ? "metric-warning" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">
        {warning && <span className="amber-dot" />}
        {detail}
      </span>
    </div>
  );
}

function ActivityView({
  data,
  onSelect,
}: {
  data: ConsoleData;
  onSelect: (order: OrderException) => void;
}) {
  const events = data.orders
    .flatMap((order) => order.events.map((event) => ({ ...event, order })))
    .sort((a, b) =>
      (b.occurredAt ?? b.time).localeCompare(a.occurredAt ?? a.time),
    );
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">THE PAPER TRAIL</div>
          <h1>Activity</h1>
          <p>
            Events for exception records. Full execution trails—including
            successful runs—are in Demo lab.
          </p>
        </div>
        <span className="subtle-chip">{events.length} demo events</span>
      </section>
      <section className="activity-panel">
        <div className="section-bar">
          <h2>Exception event history</h2>
          <span>{snapshotLabel(data.snapshotAt)} · newest first</span>
        </div>
        {events.map((event) => (
          <div className="activity-row" key={event.id}>
            <time dateTime={event.occurredAt}>
              {event.occurredAt
                ? `${event.occurredAt.slice(5, 10)} · ${event.time}`
                : event.time}
            </time>
            <span className={`activity-icon ${event.tone}`}>
              {event.tone === "success" ? (
                <CheckCheck size={17} />
              ) : event.tone === "warning" ? (
                <TriangleAlert size={17} />
              ) : (
                <Activity size={17} />
              )}
            </span>
            <div>
              <strong>{event.title}</strong>
              <p>{event.description}</p>
            </div>
            <button
              className="activity-order"
              onClick={() => onSelect(event.order)}
            >
              #{event.order.orderNumber}
              <ArrowUpRight size={14} />
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

function ConnectionsView({ source }: { source: ConsoleData["source"] }) {
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">THE CONNECTION LAYER</div>
          <h1>Connections</h1>
          <p>A clear boundary between example data and real systems.</p>
        </div>
      </section>
      <div className="connection-grid">
        <div className="connection-card">
          <span className="connection-logo shop-logo">
            <Box size={26} />
          </span>
          <span className="subtle-chip">Not connected</span>
          <h2>Shopify</h2>
          <p>
            The source of paid orders. Webhook verification and a
            development-store connection will arrive in a later increment.
          </p>
          <div className="connection-meta">
            <span>Current source</span>
            <strong>
              {source === "database"
                ? "PostgreSQL · seeded demonstration"
                : "Local TypeScript fixtures"}
            </strong>
          </div>
          <button className="button button-secondary" disabled>
            <Link2 size={15} />
            Connection setup coming later
          </button>
        </div>
        <div className="connection-card">
          <span className="connection-logo warehouse-logo">
            <PackageCheck size={26} />
          </span>
          <span className="subtle-chip">Local service · not probed</span>
          <h2>Warehouse simulator</h2>
          <p>
            A controlled environment for rejected addresses, service outages,
            and ambiguous timeouts. The Demo lab can now run these scenarios
            against the local simulator.
          </p>
          <div className="connection-meta">
            <span>Current execution</span>
            <strong>Separate worker and simulator processes</strong>
          </div>
          <button className="button button-secondary" disabled>
            <FlaskConical size={15} />
            Start with npm run simulator
          </button>
        </div>
      </div>
      <div className="plain-notice">
        <ShieldCheck size={19} />
        <div>
          <strong>No customer credentials needed.</strong>
          <p>
            The local simulator uses a generated server-only token. It does not
            connect to customer systems. Real-store authentication and webhook
            verification come later.
          </p>
        </div>
      </div>
    </>
  );
}

function DemoView({
  orders,
  onSelect,
  enabled,
  onData,
}: {
  enabled: boolean;
  onData: (data: ConsoleData) => void;
  orders: OrderException[];
  onSelect: (order: OrderException) => void;
}) {
  const resolvedExample = orders.find((order) => order.status === "resolved");
  const scenarios = [
    {
      number: "01",
      title: "A request without an answer",
      description:
        "The warehouse times out. Did it accept the order? Inspect the evidence before deciding to retry.",
      icon: Clock3,
      order: orders.find(
        (order) =>
          order.kind === "acknowledgement_unknown" &&
          order.status !== "resolved",
      ),
      note: "Ambiguous outcome",
    },
    {
      number: "02",
      title: "An address that needs a person",
      description:
        "A shipping address is rejected. The system should ask for a correction, not retry the same invalid input.",
      icon: TriangleAlert,
      order: orders.find(
        (order) =>
          order.kind === "address_rejected" && order.status !== "resolved",
      ),
      note: "Confirmed rejection",
    },
    {
      number: "03",
      title: "A warehouse taking a moment",
      description:
        "A temporary outage interrupts submission. Explore a fixture representing a safe, idempotent retry policy.",
      icon: LoaderCircle,
      order: orders.find(
        (order) =>
          order.kind === "warehouse_unavailable" && order.status !== "resolved",
      ),
      note: "Transient failure",
    },
  ];
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">MAKE FAILURE UNDERSTANDABLE</div>
          <h1>Demo lab</h1>
          <p>
            Run an order through failure. Inspect the evidence it leaves behind.
          </p>
        </div>
        <span className="subtle-chip">Submit / investigate / recover</span>
      </section>
      <ExecutionLab enabled={enabled} onData={onData} />
      <div className="lab-notice">
        <FlaskConical size={20} />
        <div>
          <strong>Explore the original snapshot examples.</strong>
          <p>
            The cards below inspect existing records. They do not execute new
            runs. They do not trigger failures, schedule retries, or change
            order state.
          </p>
        </div>
      </div>
      <div className="scenario-grid">
        {scenarios.map(
          ({ number, title, description, icon: Icon, order, note }) => (
            <article className="scenario-card" key={number}>
              <div className="scenario-top">
                <span className="scenario-icon">
                  <Icon size={22} />
                </span>
                <span>{number}</span>
              </div>
              <span className="eyebrow">{note}</span>
              <h2>{title}</h2>
              <p>{description}</p>
              <button
                className="button button-secondary"
                disabled={!order}
                onClick={() => {
                  if (order) onSelect(order);
                }}
              >
                Inspect example
                <ArrowUpRight size={16} />
              </button>
            </article>
          ),
        )}
      </div>
      <button
        className="resolved-example"
        disabled={!resolvedExample}
        onClick={() => {
          if (resolvedExample) onSelect(resolvedExample);
        }}
      >
        <span className="resolved-example-icon">
          <CheckCheck size={20} />
        </span>
        <div>
          <strong>And what does a safe recovery look like?</strong>
          <span>
            See an example where a reference lookup prevented a duplicate
            submission.
          </span>
        </div>
        <ExternalLink size={17} />
      </button>
    </>
  );
}
