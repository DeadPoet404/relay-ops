import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Mountain,
  MoveUpRight,
  Package,
} from "lucide-react";
import { StoreCollection } from "@/components/store-collection";
export default function StoreHome() {
  return (
    <>
      <section className="nl-hero">
        <Image
          src="/northline/journey.webp"
          alt="A traveller carrying a forest-green backpack overlooking a quiet coast"
          fill
          priority
          sizes="100vw"
        />
        <div className="nl-hero-shade" />
        <div className="nl-hero-content">
          <p className="nl-eyebrow">LESS TO CARRY. MORE TO FIND.</p>
          <h1>
            Everyday,
            <br />
            <em>considered.</em>
          </h1>
          <p>
            Quietly useful essentials.
            <br />
            For the everyday, and the days beyond.
          </p>
          <Link className="nl-light-button" href="#collection">
            Explore the collection <ArrowRight size={18} />
          </Link>
        </div>
        <div className="nl-hero-foot">
          <span>THE NORTHLINE COLLECTION</span>
          <span>
            MADE FOR YOUR NEXT CHAPTER <ArrowUpRight size={14} />
          </span>
        </div>
      </section>
      <div className="nl-values">
        <span>
          <Mountain size={19} strokeWidth={1.4} /> Thoughtful by design
        </span>
        <span>
          <Package size={19} strokeWidth={1.4} /> Only the essentials
        </span>
        <span>
          <MoveUpRight size={19} strokeWidth={1.4} /> Everyday, and beyond
        </span>
      </div>
      <StoreCollection />
      <section className="nl-story" id="approach">
        <div>
          <p className="nl-eyebrow">A QUIETER KIND OF MORE</p>
          <h2>
            Go further.
            <br />
            Carry less.
          </h2>
          <p>
            We like things that earn their place. Simple shapes. Considered
            details. Pieces that feel at home on the morning commute and the
            long way back.
          </p>
          <p>
            Northline is a fictional brand built around that idea. Behind this
            storefront, Relay demonstrates what happens when an order’s journey
            doesn’t go to plan.
          </p>
          <Link href="/presenter">
            See the story behind the store <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="nl-story-image">
          <Image
            src="/northline/ridge.webp"
            alt="The Ridge Daypack, a fictional Northline product"
            width={620}
            height={620}
          />
          <span>01 / THE RIDGE DAYPACK</span>
        </div>
      </section>
      <section className="nl-demo-note">
        <span className="nl-live-dot" />
        <p>
          <strong>A storefront with a story behind it.</strong> Every demo
          purchase connects to a working order-recovery system. No real money.
          No real shipments.
        </p>
        <Link href="/">
          Meet Relay <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
