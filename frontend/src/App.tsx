import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const RESERVATION_KEY = 'product-drop-reservation'
const USER_KEY = 'product-drop-user-id'
const RESERVATION_SECONDS = 15 * 60

type Product = {
  id: string
  name: string
  totalQuantity: number
  availableQuantity: number
  price: string
}

type Reservation = {
  id: string
  productId: string
  userId: string
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED'
  createdAt: string
  expiresAt: string
  product: Product
}

type Order = {
  id: string
  reservationId: string
  createdAt: string
  reservation: Reservation
}

type Toast = {
  message: string
  tone: 'error' | 'success'
}

type InitialState = {
  reservation: Reservation | null
  expired: boolean
}

function getUserId(): string {
  const stored = localStorage.getItem(USER_KEY)
  if (stored) return stored

  const userId = crypto.randomUUID()
  localStorage.setItem(USER_KEY, userId)
  return userId
}

function getInitialState(): InitialState {
  const stored = sessionStorage.getItem(RESERVATION_KEY)
  if (!stored) return { reservation: null, expired: false }

  try {
    const reservation = JSON.parse(stored) as Reservation
    if (
      reservation.status === 'PENDING' &&
      new Date(reservation.expiresAt).getTime() > Date.now()
    ) {
      return { reservation, expired: false }
    }
  } catch {
    // Invalid session data is discarded below.
  }

  sessionStorage.removeItem(RESERVATION_KEY)
  return { reservation: null, expired: true }
}

async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const body = (await response.json().catch(() => null)) as {
    message?: string | string[]
  } | null

  if (!response.ok) {
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message
    throw new Error(message || 'Something went wrong. Please try again.')
  }

  return body as T
}

function formatPrice(value: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value))
}

function Brand() {
  return (
    <div className="brand" aria-label="Minute Drop home">
      <span className="brand-mark">M</span>
      <span>MINUTE DROP</span>
    </div>
  )
}

type DashboardProps = {
  onReserve: (product: Product) => Promise<void>
  reservingId: string | null
}

function ProductDashboard({ onReserve, reservingId }: DashboardProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchProducts = useCallback(async () => {
    try {
      const available = await apiRequest<Product[]>('/products')
      setProducts(available)
      setLoadError('')
      setLastUpdated(new Date())
    } catch {
      setLoadError('We could not refresh availability. We will try again shortly.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void fetchProducts(), 0)
    const poll = window.setInterval(() => void fetchProducts(), 5_000)
    return () => {
      window.clearTimeout(initialFetch)
      window.clearInterval(poll)
    }
  }, [fetchProducts])

  return (
    <main>
      <section className="hero-section">
        <p className="eyebrow">
          <span className="live-dot" /> Live release
        </p>
        <h1>Small batch.<br />Big moment.</h1>
        <p className="hero-copy">
          Limited pieces, available right now. Once they are gone, they are gone.
        </p>
      </section>

      <section className="products-section" aria-labelledby="products-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">THE CURRENT DROP</p>
            <h2 id="products-title">Available now</h2>
          </div>
          <div className="refresh-status">
            <span className="pulse" />
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}`
              : 'Checking stock'}
          </div>
        </div>

        {loadError && <p className="inline-error">{loadError}</p>}

        {loading ? (
          <div className="loading-grid" aria-label="Loading products">
            {[0, 1, 2].map((item) => (
              <div className="skeleton" key={item} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <span>00</span>
            <h3>The drop is currently sold out.</h3>
            <p>Stay on this page. Availability refreshes every five seconds.</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card" key={product.id}>
                <div className={`product-art art-${index % 3}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div className="art-shape" />
                </div>
                <div className="product-details">
                  <div>
                    <p className="stock">
                      {product.availableQuantity} of {product.totalQuantity} left
                    </p>
                    <h3>{product.name}</h3>
                  </div>
                  <p className="price">{formatPrice(product.price)}</p>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={reservingId !== null}
                  onClick={() => void onReserve(product)}
                >
                  {reservingId === product.id ? (
                    <><span className="button-spinner" /> Reserving</>
                  ) : (
                    <>Reserve yours <span aria-hidden="true">→</span></>
                  )}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

type CheckoutProps = {
  reservation: Reservation
  completing: boolean
  onComplete: () => Promise<void>
  onExpired: () => void
}

function Checkout({
  reservation,
  completing,
  onComplete,
  onExpired,
}: CheckoutProps) {
  const expiresAt = useMemo(
    () => new Date(reservation.expiresAt).getTime(),
    [reservation.expiresAt],
  )
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000)),
  )

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000))
      setSecondsLeft(next)
      if (next === 0) onExpired()
    }

    tick()
    const timer = window.setInterval(tick, 1_000)
    return () => window.clearInterval(timer)
  }, [expiresAt, onExpired])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const progress = Math.max(0, (secondsLeft / RESERVATION_SECONDS) * 100)

  return (
    <main className="centered-main">
      <section className="checkout-card">
        <p className="eyebrow">YOUR ITEM IS HELD</p>
        <h1>Make it yours.</h1>
        <p className="checkout-intro">
          Complete your purchase before the timer runs out.
        </p>

        <div className="timer" aria-live="polite">
          <span>{String(minutes).padStart(2, '0')}</span>
          <i>:</i>
          <span>{String(seconds).padStart(2, '0')}</span>
        </div>
        <p className="timer-label">MINUTES &nbsp;&nbsp; SECONDS</p>
        <div className="timer-track">
          <div className="timer-progress" style={{ width: `${progress}%` }} />
        </div>

        <div className="checkout-product">
          <div className="checkout-art"><div className="mini-shape" /></div>
          <div>
            <p className="stock">RESERVED</p>
            <h2>{reservation.product.name}</h2>
          </div>
          <strong>{formatPrice(reservation.product.price)}</strong>
        </div>

        <button
          className="primary-button checkout-button"
          type="button"
          disabled={completing}
          onClick={() => void onComplete()}
        >
          {completing ? (
            <><span className="button-spinner" /> Completing purchase</>
          ) : (
            <>Complete purchase <span aria-hidden="true">→</span></>
          )}
        </button>
        <p className="secure-note">Secure reservation · No payment is collected in this demo</p>
      </section>
    </main>
  )
}

function Success({ order, onReturn }: { order: Order; onReturn: () => void }) {
  return (
    <main className="centered-main">
      <section className="success-card">
        <div className="success-icon">✓</div>
        <p className="eyebrow">ORDER CONFIRMED</p>
        <h1>It is officially yours.</h1>
        <p>
          Your order for <strong>{order.reservation.product.name}</strong> has
          been completed.
        </p>
        <div className="order-reference">
          <span>ORDER REFERENCE</span>
          <code>{order.id.slice(0, 8).toUpperCase()}</code>
        </div>
        <button className="secondary-button" type="button" onClick={onReturn}>
          Back to the drop
        </button>
      </section>
    </main>
  )
}

function App() {
  const [initial] = useState(getInitialState)
  const [reservation, setReservation] = useState<Reservation | null>(
    initial.reservation,
  )
  const [order, setOrder] = useState<Order | null>(null)
  const [view, setView] = useState<'dashboard' | 'checkout' | 'success'>(
    initial.reservation ? 'checkout' : 'dashboard',
  )
  const [reservingId, setReservingId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(
    initial.expired
      ? { tone: 'error', message: 'Your reservation expired. The item is available again.' }
      : null,
  )

  const showToast = useCallback((message: string, tone: Toast['tone']) => {
    setToast({ message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 5_000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const reserve = async (product: Product) => {
    setReservingId(product.id)
    try {
      const created = await apiRequest<Reservation>('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          userId: getUserId(),
        }),
      })
      sessionStorage.setItem(RESERVATION_KEY, JSON.stringify(created))
      setReservation(created)
      setView('checkout')
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'We could not reserve this item. Please try again.',
        'error',
      )
    } finally {
      setReservingId(null)
    }
  }

  const expireReservation = useCallback(() => {
    sessionStorage.removeItem(RESERVATION_KEY)
    setReservation(null)
    setView('dashboard')
    showToast('Your reservation expired. The item is available again.', 'error')
  }, [showToast])

  const completePurchase = async () => {
    if (!reservation) return

    setCompleting(true)
    try {
      const createdOrder = await apiRequest<Order>('/checkout', {
        method: 'POST',
        body: JSON.stringify({
          reservationId: reservation.id,
          userId: getUserId(),
        }),
      })
      sessionStorage.removeItem(RESERVATION_KEY)
      setOrder(createdOrder)
      setView('success')
      showToast('Purchase completed successfully.', 'success')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout could not be completed.'
      showToast(message, 'error')
      if (message.toLowerCase().includes('expired')) expireReservation()
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="app-shell">
      <header>
        <Brand />
        <p>Limited objects for considered lives.</p>
      </header>

      {view === 'dashboard' && (
        <ProductDashboard onReserve={reserve} reservingId={reservingId} />
      )}
      {view === 'checkout' && reservation && (
        <Checkout
          reservation={reservation}
          completing={completing}
          onComplete={completePurchase}
          onExpired={expireReservation}
        />
      )}
      {view === 'success' && order && (
        <Success
          order={order}
          onReturn={() => {
            setOrder(null)
            setReservation(null)
            setView('dashboard')
          }}
        />
      )}

      <footer>
        <Brand />
        <span>LIVE INVENTORY · UPDATES EVERY 5 SECONDS</span>
      </footer>

      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          <span>{toast.tone === 'success' ? '✓' : '!'}</span>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default App
