import { PAYPAL_CLIENT_ID, MERCHANT } from './merchant-config.js';
import { loadCart, cartSubtotal, cartHasNonPurchasableItems, clearCart } from './cart.js';

const PAYPAL_ME_URL = 'https://www.paypal.com/paypalme/1968428713';
let paypalPromise = null;
let paypalRenderKey = '';

function payableCartState(productById) {
  const cart = loadCart();
  const subtotal = cartSubtotal(productById);
  const hasQuotes = cartHasNonPurchasableItems(productById);
  return {
    cart,
    subtotal,
    hasQuotes,
    payable: cart.length > 0 && !hasQuotes && Number.isFinite(subtotal) && subtotal > 0
  };
}

function ensureStaticPaymentFallback(status, productById) {
  let fallback = document.querySelector('#paypal-static-fallback');
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.id = 'paypal-static-fallback';
    fallback.className = 'paypal-static-fallback';
    status.insertAdjacentElement('afterend', fallback);
  }

  const { payable, subtotal, cart, hasQuotes } = payableCartState(productById);
  const isEnglish = document.documentElement.lang === 'en';
  const amount = payable ? subtotal.toFixed(2) : '';
  const amountLabel = payable
    ? ` €${subtotal.toLocaleString(isEnglish ? 'en-GB' : 'bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
  const target = payable ? `${PAYPAL_ME_URL}/${amount}EUR` : '';
  const disabledLabel = hasQuotes
    ? (isEnglish ? 'Payment available after quote confirmation' : 'Плащането е достъпно след потвърждение на офертата')
    : (isEnglish ? 'Add a payable EUR product to activate checkout' : 'Добави платим продукт с EUR цена, за да активираш плащането');

  fallback.innerHTML = payable
    ? `<a class="paypal-static-button paypal-static-paypal" href="${target}" target="_blank" rel="noopener noreferrer">PayPal${amountLabel}</a>
       <a class="paypal-static-button paypal-static-card" href="${target}" target="_blank" rel="noopener noreferrer">💳 ${isEnglish ? 'Card / PayPal' : 'Дебитна / кредитна карта'}${amountLabel}</a>
       <small>${isEnglish ? 'Secure payment via PayPal.Me. The amount matches the payable cart total.' : 'Сигурно плащане чрез PayPal.Me. Сумата съответства на платимата стойност на кошницата.'}</small>`
    : `<button class="paypal-static-button paypal-static-paypal" type="button" disabled aria-disabled="true">PayPal</button>
       <button class="paypal-static-button paypal-static-card" type="button" disabled aria-disabled="true">💳 ${isEnglish ? 'Card / PayPal' : 'Дебитна / кредитна карта'}</button>
       <small>${disabledLabel}.</small>`;

  fallback.hidden = false;
  fallback.dataset.payable = payable ? 'true' : 'false';
  return fallback;
}

function ensureCardContainer(container) {
  let card = document.querySelector('#paypal-card-button-container');
  if (!card) {
    card = document.createElement('div');
    card.id = 'paypal-card-button-container';
    card.setAttribute('aria-label', 'Debit or credit card payment');
    container.insertAdjacentElement('afterend', card);
  }
  return card;
}

function cartRenderKey(productById) {
  const { cart, subtotal } = payableCartState(productById);
  return JSON.stringify({
    cart,
    subtotal: Number(subtotal.toFixed(2)),
    language: document.documentElement.lang
  });
}

export function renderPaymentSummary(productById) {
  const summary = document.querySelector('#paypal-payment-summary');
  const itemsEl = document.querySelector('#paypal-payment-items');
  const totalEl = document.querySelector('#paypal-payment-total');
  const titleEl = document.querySelector('#paypal-payment-summary-title');
  const totalLabelEl = document.querySelector('#paypal-payment-total-label');
  if (!summary || !itemsEl || !totalEl) return;

  const isEnglish = document.documentElement.lang === 'en';
  if (titleEl) titleEl.textContent = isEnglish ? 'Payment order' : 'Поръчка за плащане';
  if (totalLabelEl) totalLabelEl.textContent = isEnglish ? 'Total' : 'Общо';

  const items = loadCart()
    .map((entry) => ({ entry, product: productById(entry.id) }))
    .filter(({ product }) => product);

  if (!items.length) {
    itemsEl.replaceChildren();
    totalEl.textContent = '€0.00';
    summary.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const { entry, product } of items) {
    const row = document.createElement('div');
    row.className = 'selected-row';
    const name = document.createElement('strong');
    name.textContent = `${product.name}${product.model ? ` · ${product.model}` : ''} × ${entry.quantity}`;
    const amount = document.createElement('strong');
    const payable = product.priceKnown && product.priceCurrency === 'EUR' && Number.isFinite(product.price);
    amount.textContent = payable
      ? `€${(product.price * entry.quantity).toLocaleString(isEnglish ? 'en-GB' : 'bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : (isEnglish ? 'Price on request' : 'Цена при запитване');
    row.append(name, amount);
    fragment.appendChild(row);
  }
  itemsEl.replaceChildren(fragment);
  const subtotal = cartSubtotal(productById);
  totalEl.textContent = `€${subtotal.toLocaleString(isEnglish ? 'en-GB' : 'bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  summary.hidden = false;
}

export function initCartPayment(productById) {
  const container = document.querySelector('#paypal-button-container');
  const status = document.querySelector('#paypal-status');
  if (!container || !status) return;

  const fallback = ensureStaticPaymentFallback(status, productById);
  const state = payableCartState(productById);
  const key = cartRenderKey(productById);

  if (!state.payable) {
    container.replaceChildren();
    document.querySelector('#paypal-card-button-container')?.replaceChildren();
    document.querySelector('#paypal-card-button-container')?.remove();
    container.dataset.paypalReady = 'false';
    paypalRenderKey = '';
    fallback.hidden = false;
    status.textContent = state.hasQuotes
      ? (document.documentElement.lang === 'en' ? 'The cart contains a quote-based product. Confirm the final amount before payment.' : 'Кошницата съдържа продукт с цена при запитване. Потвърди крайната сума преди плащане.')
      : (document.documentElement.lang === 'en' ? 'Add a payable EUR product to activate PayPal checkout.' : 'Добави платим продукт с валидна EUR цена в кошницата, за да активираш PayPal checkout.');
    return;
  }

  if (!PAYPAL_CLIENT_ID) {
    container.replaceChildren();
    container.dataset.paypalReady = 'false';
    fallback.hidden = false;
    status.textContent = isEnglish()
      ? 'PayPal checkout is unavailable; use the secure PayPal.Me amount below.'
      : 'PayPal checkout временно не е наличен; използвай защитеното плащане по сумата на кошницата по-долу.';
    return;
  }

  if (container.dataset.paypalReady === 'true' && paypalRenderKey === key && container.children.length) {
    fallback.hidden = true;
    return;
  }

  if (container.dataset.paypalLoading === 'true' && paypalRenderKey === key) return;

  container.replaceChildren();
  document.querySelector('#paypal-card-button-container')?.remove();
  container.dataset.paypalReady = 'false';
  container.dataset.paypalLoading = 'true';
  paypalRenderKey = key;
  fallback.hidden = true;
  status.textContent = isEnglish() ? 'Loading secure PayPal checkout…' : 'Зарежда се сигурният PayPal checkout…';

  loadPayPal(PAYPAL_CLIENT_ID)
    .then(() => {
      if (!window.paypal?.Buttons) throw new Error('PayPal SDK unavailable');

      const currentKey = cartRenderKey(productById);
      if (currentKey !== key) {
        container.dataset.paypalLoading = 'false';
        initCartPayment(productById);
        return;
      }

      const validateCart = () => {
        const current = payableCartState(productById);
        if (!current.cart.length) throw new Error('Cart is empty');
        if (current.hasQuotes) throw new Error('Cart contains quote-only or non-EUR items');
        if (!current.payable) throw new Error('No payable EUR products in cart');
        return current;
      };

      const createOrder = (_data, actions) => {
        const { cart, subtotal } = validateCart();
        const items = cart.map((entry) => {
          const product = productById(entry.id);
          return {
            name: product.name.slice(0, 127),
            sku: product.model || product.id,
            unit_amount: { currency_code: 'EUR', value: Number(product.price).toFixed(2) },
            quantity: String(entry.quantity)
          };
        });
        return actions.order.create({
          purchase_units: [{
            description: `WAGNER-BG order — ${MERCHANT.legalName}`,
            amount: {
              currency_code: 'EUR',
              value: subtotal.toFixed(2),
              breakdown: { item_total: { currency_code: 'EUR', value: subtotal.toFixed(2) } }
            },
            items
          }]
        });
      };

      const onClick = (_data, actions) => {
        try {
          validateCart();
          return actions.resolve();
        } catch {
          status.textContent = isEnglish()
            ? 'Add a payable EUR product to the cart before continuing.'
            : 'Добави платим продукт с валидна EUR цена в кошницата, преди да продължиш.';
          return actions.reject();
        }
      };

      const onApprove = (data, actions) => actions.order.capture()
        .then(() => {
          const orderId = data?.orderID || '';
          clearCart();
          renderPaymentSummary(productById);
          container.replaceChildren();
          document.querySelector('#paypal-card-button-container')?.remove();
          container.dataset.paypalReady = 'false';
          container.dataset.paypalLoading = 'false';
          paypalRenderKey = '';
          fallback.hidden = true;
          status.textContent = isEnglish()
            ? `Payment completed successfully${orderId ? ` · PayPal Order ID: ${orderId}` : ''}.`
            : `Плащането е успешно завършено${orderId ? ` · PayPal Order ID: ${orderId}` : ''}.`;
        })
        .catch((error) => {
          console.error('PayPal capture failed:', error);
          status.textContent = isEnglish()
            ? 'PayPal could not complete the payment. Please try again.'
            : 'PayPal не успя да завърши плащането. Моля, опитай отново.';
        });

      const onCancel = () => {
        status.textContent = isEnglish()
          ? 'Payment was cancelled. Your cart is unchanged.'
          : 'Плащането беше отменено. Кошницата ти не е променена.';
      };

      const onError = (error) => {
        console.error('PayPal checkout error:', error);
        container.dataset.paypalReady = 'false';
        container.dataset.paypalLoading = 'false';
        ensureStaticPaymentFallback(status, productById).hidden = false;
        status.textContent = isEnglish()
          ? 'PayPal checkout is temporarily unavailable. Use the secure payment amount below.'
          : 'PayPal checkout временно не е наличен. Използвай защитеното плащане по сумата на кошницата по-долу.';
      };

      const baseOptions = {
        style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'pay' },
        createOrder,
        onClick,
        onApprove,
        onCancel,
        onError
      };

      const paypalButton = window.paypal.Buttons(baseOptions);
      const renders = [];
      if (paypalButton.isEligible()) renders.push(paypalButton.render(container));

      if (window.paypal.FUNDING?.CARD) {
        const cardButton = window.paypal.Buttons({
          fundingSource: window.paypal.FUNDING.CARD,
          style: { shape: 'rect', layout: 'vertical', label: 'pay' },
          createOrder,
          onClick,
          onApprove,
          onCancel,
          onError
        });
        if (cardButton.isEligible()) {
          renders.push(cardButton.render(ensureCardContainer(container)));
        }
      }

      if (!renders.length) throw new Error('No eligible PayPal funding source');
      return Promise.all(renders);
    })
    .then(() => {
      container.dataset.paypalLoading = 'false';
      container.dataset.paypalReady = 'true';
      fallback.hidden = true;
      status.textContent = isEnglish()
        ? 'Pay securely with PayPal or debit/credit card.'
        : 'Плати сигурно с PayPal или с дебитна/кредитна карта.';
    })
    .catch((error) => {
      console.error('PayPal initialization failed:', error);
      container.dataset.paypalReady = 'false';
      container.dataset.paypalLoading = 'false';
      paypalRenderKey = '';
      ensureStaticPaymentFallback(status, productById).hidden = false;
      status.textContent = isEnglish()
        ? 'PayPal checkout is temporarily unavailable. Use the secure payment amount below.'
        : 'PayPal checkout временно не е наличен. Използвай защитеното плащане по сумата на кошницата по-долу.';
    });
}

function isEnglish() {
  return document.documentElement.lang === 'en';
}

function loadPayPal(clientId) {
  if (window.paypal) return Promise.resolve();
  if (paypalPromise) return paypalPromise;

  paypalPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wagner-paypal]');
    if (existing) {
      if (window.paypal) {
        resolve();
        return;
      }
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture&components=buttons&enable-funding=card`;
    script.async = true;
    script.dataset.wagnerPaypal = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load PayPal SDK'));
    document.head.appendChild(script);
  });

  paypalPromise.catch(() => {
    paypalPromise = null;
  });
  return paypalPromise;
}
