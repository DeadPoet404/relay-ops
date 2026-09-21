"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { guidedKey } from "@/demo/browser";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Minus,
  Plus,
  ShoppingBag,
  X,
  Mountain,
} from "lucide-react";
import { cartSchema, type Cart } from "@/store/cart";
import { money, productById } from "@/store/catalog";
interface Basket {
  cart: Cart;
  ready: boolean;
  add: (id: string) => void;
  change: (id: string, n: number) => void;
  clear: () => void;
}
const CartContext = createContext<Basket | null>(null);
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("Store provider missing");
  return value;
}
export function StoreShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [guided, setGuided] = useState(false);
  const [cart, setCart] = useState<Cart>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = cartSchema.safeParse(
          JSON.parse(localStorage.getItem("northline.cart") ?? "[]"),
        );
        if (stored.success) setCart(stored.data);
      } catch {}
      try {
        setGuided(sessionStorage.getItem(guidedKey) === "true");
      } catch {}
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function change(id: string, n: number) {
    if (!ready || !productById(id)) return;
    setCart((current) => {
      const next = [
        ...current.filter((i) => i.productId !== id),
        ...(n > 0 ? [{ productId: id, quantity: Math.min(5, n) }] : []),
      ];
      try {
        localStorage.setItem("northline.cart", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function add(id: string) {
    change(id, (cart.find((i) => i.productId === id)?.quantity ?? 0) + 1);
    setOpen(true);
  }
  function clear() {
    setCart([]);
    try {
      localStorage.removeItem("northline.cart");
    } catch {}
  }
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  const total = cart.reduce(
    (n, i) => n + productById(i.productId)!.price * i.quantity,
    0,
  );
  return (
    <CartContext.Provider value={{ cart, ready, add, change, clear }}>
      <div className="nl">
        <a href="#store-main" className="skip-link">
          Skip to content
        </a>
        <div className="nl-demo-bar">
          A fictional store. A working recovery system.{" "}
          <span>No real payments or shipments.</span>
        </div>
        <header className="nl-header">
          <Link
            href="/store"
            className="nl-brand"
            aria-label="Northline Supply home"
          >
            <Mountain size={30} strokeWidth={1.3} />
            <span>
              northline<span className="nl-brand-small">SUPPLY</span>
            </span>
          </Link>
          <nav aria-label="Store navigation">
            <Link href="/store#collection">The collection</Link>
            <Link href="/store#approach">Our approach</Link>
          </nav>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                className="nl-bag"
                aria-label={`Open bag, ${count} items`}
              >
                <ShoppingBag size={19} />
                <span>Bag</span>
                <b>{count}</b>
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="nl-overlay" />
              <Dialog.Content className="nl nl-bag-panel">
                <div className="nl-bag-heading">
                  <Dialog.Title>
                    Your bag <span>({count})</span>
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="nl-icon" aria-label="Close bag">
                      <X size={22} />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="nl-muted">
                  A few good things, ready to go.
                </Dialog.Description>
                {cart.length ? (
                  <>
                    <div className="nl-bag-items">
                      {cart.map((i) => {
                        const p = productById(i.productId)!;
                        return (
                          <div className="nl-cart-line" key={p.id}>
                            <Image
                              src={p.image}
                              alt={p.name}
                              width={100}
                              height={120}
                            />
                            <div>
                              <h3>{p.name}</h3>
                              <p>
                                {p.color} / {p.size}
                              </p>
                              <div className="nl-quantity">
                                <button
                                  aria-label={`Remove one ${p.name}`}
                                  onClick={() => change(p.id, i.quantity - 1)}
                                >
                                  <Minus size={12} />
                                </button>
                                <span>{i.quantity}</span>
                                <button
                                  disabled={i.quantity === 5}
                                  aria-label={`Add one ${p.name}`}
                                  onClick={() => change(p.id, i.quantity + 1)}
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                              <button
                                className="nl-text-button"
                                onClick={() => change(p.id, 0)}
                              >
                                Remove
                              </button>
                            </div>
                            <b>{money(p.price * i.quantity)}</b>
                          </div>
                        );
                      })}
                    </div>
                    <div className="nl-bag-bottom">
                      <div className="nl-total">
                        <span>Subtotal</span>
                        <strong>{money(total)}</strong>
                      </div>
                      <p>
                        USD · Demo delivery and tax: $0. No charge will be made.
                      </p>
                      <Link
                        className="nl-primary"
                        href="/store/checkout"
                        onClick={() => setOpen(false)}
                      >
                        Continue to demo checkout <ArrowRight size={17} />
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="nl-empty">
                    <ShoppingBag size={35} strokeWidth={1} />
                    <h3>Room for something good.</h3>
                    <p>Your bag is currently empty.</p>
                    <Dialog.Close asChild>
                      <Link className="nl-primary" href="/store#collection">
                        Explore the collection <ArrowRight size={16} />
                      </Link>
                    </Dialog.Close>
                  </div>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </header>
        {guided && (
          <nav className="nl-guided-bar" aria-label="Guided demo progress">
            <Link href="/demo/start">✓ Choose a problem</Link>
            <span
              aria-current={
                pathname.startsWith("/store/orders/") ? undefined : "step"
              }
            >
              2 · Shop & check out
            </span>
            <span
              aria-current={
                pathname.startsWith("/store/orders/") ? "step" : undefined
              }
            >
              3 · See your order’s result
            </span>
          </nav>
        )}
        <main id="store-main">{children}</main>
        <footer className="nl-footer">
          <div>
            <Link href="/store" className="nl-footer-brand">
              northline supply.
            </Link>
            <p>For the everyday. And the days beyond.</p>
          </div>
          <div className="nl-footer-links">
            <Link href="/">Relay console ↗</Link>
            <Link href="/demo">Try the guided demo ↗</Link>
          </div>
          <div className="nl-footer-bottom">
            <span>Northline Supply · A fictional merchant by Relay</span>
            <span>
              AI-generated product imagery · Demo products, not for sale
            </span>
          </div>
        </footer>
      </div>
    </CartContext.Provider>
  );
}
export function AddToBag({ id }: { id: string }) {
  const { add, ready } = useCart();
  return (
    <button className="nl-primary" disabled={!ready} onClick={() => add(id)}>
      Add to bag <Plus size={17} />
    </button>
  );
}
