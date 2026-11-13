/**
 * The browser half of the local Stripe mock.
 *
 * Playwright serves this text in place of `https://js.stripe.com/v3/` (see `fixtures.ts`), so the
 * real `@stripe/react-stripe-js` provider drives a fake `window.Stripe` that renders a small card
 * form and posts the entered number to `stripe-mock.mjs`. That keeps `PaymentElement`'s mounting,
 * the confirm/lock state and the `interpretPaymentResult` branches under test without a Stripe
 * account or network access.
 *
 * `mockOrigin` is the mock the stub posts to; `playwright.config.ts` starts it from the same
 * `E2E_STRIPE_MOCK_PORT`.
 */
export const fakeStripeJs = (mockOrigin: string): string => String.raw`
(function () {
  var MOCK_ORIGIN = ${JSON.stringify(mockOrigin)};

  function field(label, id, name, placeholder, autocomplete, extra) {
    return (
      '<div style="display:flex;flex-direction:column;gap:6px">' +
      '<label for="' + id + '" style="font-size:13px;font-weight:500;color:#374151">' + label + '</label>' +
      '<input id="' + id + '" name="' + name + '" type="text" inputmode="numeric" ' +
      'autocomplete="' + autocomplete + '" placeholder="' + placeholder + '" ' +
      'style="padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;' + (extra || "") + '" />' +
      '</div>'
    );
  }

  function mountCardForm(node, state, handlers) {
    node.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:14px">' +
      field("Card number", "mock-card-number", "cardnumber", "1234 1234 1234 1234", "cc-number", "letter-spacing:1px") +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      field("Expiry", "mock-card-expiry", "exp-date", "MM / YY", "cc-exp", "") +
      field("CVC", "mock-card-cvc", "cvc", "CVC", "cc-csc", "") +
      "</div>" +
      '<p style="font-size:12px;color:#6b7280;margin:0">Local Stripe mock: no card data leaves this machine.</p>' +
      "</div>";

    var number = node.querySelector("#mock-card-number");
    var expiry = node.querySelector("#mock-card-expiry");
    var cvc = node.querySelector("#mock-card-cvc");

    number.addEventListener("input", function () {
      state.number = number.value;
    });
    expiry.addEventListener("input", function () {
      state.expiry = expiry.value;
    });
    cvc.addEventListener("input", function () {
      state.cvc = cvc.value;
    });

    setTimeout(function () {
      (handlers.ready || []).forEach(function (callback) {
        try {
          callback({ element: null });
        } catch (_error) {
          /* A listener throwing must not break the checkout. */
        }
      });
      (handlers.change || []).forEach(function (callback) {
        try {
          callback({ complete: true, empty: false });
        } catch (_error) {
          /* ignored */
        }
      });
    }, 0);
  }

  function createElement(type, state) {
    var handlers = {};
    var mountedNode = null;

    var element = {
      mount: function (node) {
        mountedNode = node;
        mountCardForm(node, state, handlers);
      },
      destroy: function () {
        if (mountedNode) mountedNode.innerHTML = "";
        mountedNode = null;
      },
      update: function () {},
      on: function (event, handler) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      off: function (event, handler) {
        handlers[event] = (handlers[event] || []).filter(function (candidate) {
          return candidate !== handler;
        });
      },
      focus: function () {
        var input = mountedNode && mountedNode.querySelector("#mock-card-number");
        if (input) input.focus();
      },
      blur: function () {
        var input = mountedNode && mountedNode.querySelector("#mock-card-number");
        if (input) input.blur();
      },
      clear: function () {
        state.number = "";
        state.expiry = "";
        state.cvc = "";
        if (mountedNode) {
          ["#mock-card-number", "#mock-card-expiry", "#mock-card-cvc"].forEach(function (selector) {
            var input = mountedNode.querySelector(selector);
            if (input) input.value = "";
          });
        }
      },
      collapse: function () {}
    };

    // The element type is "payment" for PaymentElement; other types are unused by the app.
    void type;
    return element;
  }

  function Stripe(publishableKey) {
    void publishableKey;

    return {
      elements: function (options) {
        var state = { number: "", expiry: "", cvc: "" };
        var elements = {
          _clientSecret: options && options.clientSecret,
          _state: state,
          create: function (type) {
            return createElement(type, state);
          },
          getElement: function () {
            return null;
          },
          update: function () {},
          fetchUpdates: function () {
            return Promise.resolve();
          }
        };
        return elements;
      },
      confirmPayment: function (args) {
        var elements = args && args.elements;
        var state = (elements && elements._state) || { number: "", expiry: "", cvc: "" };
        var clientSecret = elements && elements._clientSecret;

        return fetch(MOCK_ORIGIN + "/__mock/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientSecret: clientSecret,
            card: { number: state.number, expiry: state.expiry, cvc: state.cvc }
          })
        })
          .then(function (response) {
            return response.json();
          })
          .then(function (result) {
            if (result && result.error) return { error: result.error };
            return { paymentIntent: result.paymentIntent };
          });
      },
      confirmCardPayment: function () {
        return Promise.resolve({
          error: { message: "Not supported by the local Stripe mock." }
        });
      },
      createToken: function () {
        return Promise.resolve({
          error: { message: "Not supported by the local Stripe mock." }
        });
      },
      createPaymentMethod: function () {
        return Promise.resolve({
          error: { message: "Not supported by the local Stripe mock." }
        });
      },
      registerAppInfo: function () {},
      _registerWrapper: function () {}
    };
  }

  Stripe.version = "local-mock";
  window.Stripe = Stripe;
})();
`;
