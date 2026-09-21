"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Plus } from "lucide-react";
import { products, money } from "@/store/catalog";
import { useCart } from "./store-shell";
export function StoreCollection() {
  const [category, setCategory] = useState("All essentials");
  const { add, ready } = useCart();
  return (
    <section className="nl-collection" id="collection">
      <div className="nl-section-heading">
        <div>
          <p className="nl-eyebrow">THE EVERYDAY EDIT / 01</p>
          <h2>Good things. Fewer things.</h2>
        </div>
        <p>
          Purposeful pieces for wherever
          <br />
          your day takes you.
        </p>
      </div>
      <div className="nl-filters" role="group" aria-label="Product category">
        {["All essentials", "Bags", "Accessories"].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            className={category === c ? "active" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <span>
          {
            products.filter(
              (p) => category === "All essentials" || p.category === category,
            ).length
          }{" "}
          considered essentials
        </span>
      </div>
      <div className="nl-product-grid">
        {products
          .filter(
            (p) => category === "All essentials" || p.category === category,
          )
          .map((p, index) => (
            <article className="nl-product" key={p.id}>
              <div className="nl-product-photo">
                <Link
                  href={`/store/products/${p.id}`}
                  aria-label={`View ${p.name}`}
                >
                  <Image
                    src={p.image}
                    alt={`${p.name} in ${p.color}`}
                    width={620}
                    height={620}
                  />
                </Link>
                {index === 0 && category === "All essentials" && (
                  <span className="nl-product-tag">THE DAILY COMPANION</span>
                )}
                <button
                  className="nl-quick-add"
                  aria-label={`Add ${p.name} to bag`}
                  disabled={!ready}
                  onClick={() => add(p.id)}
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="nl-product-title">
                <Link href={`/store/products/${p.id}`}>
                  <h3>{p.name}</h3>
                </Link>
                <span>{money(p.price)}</span>
              </div>
              <p>
                {p.color} <span>·</span> {p.size}
              </p>
            </article>
          ))}
      </div>
      <div className="nl-collection-end">
        <span>One thoughtful collection. Nothing more than you need.</span>
        <Link href="/store/products/ridge-pack">
          Meet the Ridge Daypack <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
