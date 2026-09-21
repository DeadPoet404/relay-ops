import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check } from "lucide-react";
import { money, productById, products } from "@/store/catalog";
import { AddToBag } from "@/components/store-shell";
export function generateStaticParams() {
  return products.map((p) => ({ slug: p.id }));
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = productById(slug);
  if (!p) notFound();
  return (
    <div className="nl-product-page">
      <Link href="/store#collection" className="nl-back">
        <ArrowLeft size={15} /> Back to the collection
      </Link>
      <div className="nl-product-detail">
        <div className="nl-detail-image">
          <Image
            src={p.image}
            alt={`${p.name} in ${p.color}`}
            width={700}
            height={700}
            priority
          />
        </div>
        <div className="nl-detail-copy">
          <p className="nl-eyebrow">NORTHLINE / {p.category.toUpperCase()}</p>
          <h1>{p.name}</h1>
          <p className="nl-detail-price">
            {money(p.price)} <span>USD</span>
          </p>
          <p className="nl-detail-description">{p.description}</p>
          <p>{p.detail}</p>
          <div className="nl-detail-variant">
            <span className={`nl-swatch nl-swatch-${p.color.toLowerCase()}`} />
            <span>
              {p.color} / {p.size}
            </span>
            <span>One considered choice.</span>
          </div>
          <AddToBag id={p.id} />
          <p className="nl-fine-print">
            Fictional product · Demo checkout only · No charge
          </p>
          <ul>
            {p.features.map((f) => (
              <li key={f}>
                <Check size={15} />
                {f}
              </li>
            ))}
          </ul>
          <details>
            <summary>About this product</summary>
            <p>
              Product imagery is AI-generated. Materials and features describe a
              fictional catalog, not tested merchandise. Nothing is sold or
              shipped.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
