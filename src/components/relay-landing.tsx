"use client";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Clock, AlertTriangle, Search, Package, Truck, Box, Activity, Link2, ArrowUpRight, Play } from "lucide-react";
import "./relay-landing.css";

export function RelayLanding() {
  return (
    <div className="rl">
      <header className="rl-header">
        <div className="rl-header-inner">
          <div className="rl-brand">
            <span className="rl-mark"><i /><i /><i /></span>
            <span>relay.</span>
          </div>
          <nav>
            <Link href="/console">Console</Link>
            <Link href="/demo">Guided demo</Link>
            <Link href="/store">Storefront</Link>
          </nav>
        </div>
      </header>

      <section className="rl-hero">
        <div className="rl-hero-inner">
          <div className="rl-hero-copy">
            <span className="rl-eyebrow">ORDER RECOVERY CONSOLE · PORTFOLIO</span>
            <h1>Orders don&apos;t get lost.<br />They get stuck.</h1>
            <p>
              Relay is a safe recovery system for the space between payment and fulfillment.
              Bounded retries, reference lookups, and full evidence — so you never blind-resubmit
              and never silently duplicate.
            </p>
            <div className="rl-ctas">
              <Link href="/demo" className="rl-primary">Try the guided demo <ArrowRight size={16} /></Link>
              <Link href="/store" className="rl-secondary">Explore Northline store <ArrowUpRight size={16} /></Link>
            </div>
            <div className="rl-meta">
              <span><Check size={12} /> Next.js + Tailwind · PostgreSQL · pg-boss</span>
              <span><Check size={12} /> Fictional store · No real payments or shipments</span>
            </div>
          </div>
          <div className="rl-hero-visual">
            <div className="rl-card">
              <div className="rl-card-header">
                <span className="rl-live"><i /> Live · NL-8F3A2C91</span>
                <span className="rl-pill">68%</span>
              </div>
              <div className="rl-stages">
                <div className="rl-stage done"><div className="rl-dot done"><Check size={10} /></div><div><strong>Order recorded</strong><small>Saved locally · pacing enabled</small></div></div>
                <div className="rl-stage active"><div className="rl-dot active"><Clock size={10} /></div><div><strong>Warehouse submission</strong><small>Queued — submitting in 3s · 6s pacing</small></div></div>
                <div className="rl-stage pending"><div className="rl-dot pending" /><div><strong>Checking confirmation</strong><small>Will check after submission</small></div></div>
                <div className="rl-stage pending"><div className="rl-dot pending" /><div><strong>Awaiting confirmation</strong><small>Never silent duplicate</small></div></div>
              </div>
              <div className="rl-card-foot">6s queue via startAfter + 2s handoff after durable claim. You clicked → system working.</div>
            </div>
            <div className="rl-note">
              <ShieldCheck size={14} /> Real DB transaction + queue job. Not a fake loader.
            </div>
          </div>
        </div>
      </section>

      <section className="rl-problem">
        <div className="rl-section-inner">
          <span className="rl-eyebrow">THE PROBLEM</span>
          <h2>Payment succeeds. Fulfillment doesn&apos;t know.</h2>
          <p className="rl-lead">Three ways orders get stuck — and why blind retries make it worse.</p>
          <div className="rl-grid3">
            <div className="rl-problem-card">
              <Clock size={18} />
              <h3>A request without an answer</h3>
              <p>Warehouse times out. Did it accept? Retry same reference and you risk a duplicate. Check original via lookup first.</p>
              <span>Ambiguous outcome → lookup</span>
            </div>
            <div className="rl-problem-card">
              <AlertTriangle size={18} />
              <h3>An address that needs a person</h3>
              <p>Shipping address rejected. System should ask for correction, not retry same invalid input.</p>
              <span>Confirmed rejection → human review</span>
            </div>
            <div className="rl-problem-card">
              <Search size={18} />
              <h3>A warehouse taking a moment</h3>
              <p>Temporary outage. Safe to retry — but bounded, with evidence, original reference kept.</p>
              <span>Transient failure → 3 attempts max</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rl-solution">
        <div className="rl-section-inner">
          <div className="rl-solution-grid">
            <div>
              <span className="rl-eyebrow">THE SOLUTION</span>
              <h2>Safe recovery, not hopeful retry.</h2>
              <div className="rl-bullets">
                <div><strong>3 submissions total, 3 lookups total</strong><span>Retries wait 2s then 4s + jitter. Uncertain outcomes use read-only GET, never blind POST.</span></div>
                <div><strong>Same DB transaction</strong><span>Order + job saved atomically. Recovery action + audit + queue job also atomic.</span></div>
                <div><strong>Claims before HTTP</strong><span>Worker records claim before warehouse call. Crash during pause → interrupted → lookup, never duplicate.</span></div>
                <div><strong>Evidence, not assumptions</strong><span>Every attempt, lookup, and decision is audited with time, reference, and outcome.</span></div>
              </div>
            </div>
            <div className="rl-arch">
              <div className="rl-arch-box">
                <div className="rl-arch-row">
                  <span className="rl-arch-node">Storefront<br /><small>Next.js · bag · checkout</small></span>
                  <span className="rl-arch-arrow">→</span>
                  <span className="rl-arch-node accent">PostgreSQL<br /><small>order + job same TX</small></span>
                </div>
                <div className="rl-arch-row">
                  <span className="rl-arch-node">pg-boss queue<br /><small>startAfter 6s · retry 2s</small></span>
                  <span className="rl-arch-arrow">→</span>
                  <span className="rl-arch-node">Worker<br /><small>claim before HTTP · 2s handoff</small></span>
                  <span className="rl-arch-arrow">→</span>
                  <span className="rl-arch-node">Simulator<br /><small>4010 · controlled failures</small></span>
                </div>
                <div className="rl-arch-foot">Minutely reconciliation + startup scan re-arms overdue actions. No real shipments.</div>
              </div>
              <div className="rl-stats">
                <div><strong>6</strong><span>Scenarios: accepted, rejected, outage, timeout, retry, unavailable</span></div>
                <div><strong>100%</strong><span>Evidence-based: every run shows attempts, lookups, audit</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rl-demo">
        <div className="rl-section-inner">
          <span className="rl-eyebrow">LIVE DEMO</span>
          <h2>A purchase you can follow.</h2>
          <div className="rl-demo-grid">
            <div className="rl-demo-steps">
              <div><span>01</span><div><strong>Choose a problem at /demo/start</strong><p>Recommended: The warehouse reply goes missing.</p></div></div>
              <div><span>02</span><div><strong>Shop Northline, add to bag</strong><p>Persistent bag, no charge. System activity widget shows Bag updated instantly.</p></div></div>
              <div><span>03</span><div><strong>Place demo order — watch real work</strong><p>Validating → reserving transaction → guided flow with 4 stages, variable timing, live log.</p></div></div>
              <div><span>04</span><div><strong>Follow the live journey everywhere</strong><p>Widget follows you: store → order → evidence. Same UUID, no searching.</p></div></div>
            </div>
            <div className="rl-demo-cards">
              <Link href="/demo" className="rl-demo-card">
                <div className="rl-demo-card-top"><Play size={16} /> Guided demo <ArrowRight size={14} /></div>
                <h3>Exact evidence-based results</h3>
                <p>Pick a scenario, see the same UUID through queue, worker, and audit.</p>
              </Link>
              <Link href="/store" className="rl-demo-card">
                <div className="rl-demo-card-top"><Box size={16} /> Northline storefront <ArrowRight size={14} /></div>
                <h3>Fictional store, real system</h3>
                <p>4 products, persistent cart, no-charge checkout, order status with live tracker.</p>
              </Link>
              <Link href="/console" className="rl-demo-card">
                <div className="rl-demo-card-top"><Activity size={16} /> Console <ArrowRight size={14} /></div>
                <h3>Exceptions, activity, connections</h3>
                <p>Original snapshot + live lab runs, audit trail, safe next steps.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="rl-stack">
        <div className="rl-section-inner">
          <div className="rl-stack-grid">
            <div>
              <span className="rl-eyebrow">STACK</span>
              <h3>Built to demonstrate, not to pretend.</h3>
              <p>Clean minimal console, durable execution, fictional data only. No Shopify, no real shipments, no PII.</p>
            </div>
            <div className="rl-stack-list">
              <div><Package size={14} /> Next.js 16 + Tailwind · App Router · Server Components</div>
              <div><Link2 size={14} /> PostgreSQL 17 + Drizzle · pg-boss queue · advisory locks</div>
              <div><Truck size={14} /> Warehouse simulator on 4010 · controlled failures</div>
              <div><ShieldCheck size={14} /> Bounded retries, reference lookups, reconciliation scan</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="rl-footer">
        <div className="rl-footer-inner">
          <span>RELAY / BUILT FOR THE IN-BETWEEN · Portfolio demonstration · No real payments or shipments</span>
          <span>DeadPoet404 / relay-ops · 007-011</span>
        </div>
      </footer>
    </div>
  );
}
