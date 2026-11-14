# Peachy Orders ♡

A pastel pink, peach and cream order-status website. Customers can search orders using a Twitter/X username and view aggregate product-line progress. An optional customer shopping page can be switched on or off by the admin. When enabled, customers can add products to a cart, see the shop bank details, upload a payment slip and submit an order for manual bank verification.

## Files
- `index.html` — customer tracking page, product-line overview tab, and admin dashboard
- `styles.css` — responsive pastel theme
- `app.js` — X username lookup, product-line status overview, and standard admin order actions
- `shop.js` — optional storefront, cart, payment slip upload, admin shop settings and payment verification
- `config.js` — Supabase project URL and anon key
- `supabase-schema.sql` — database, access policies, customer lookup, and aggregate product overview

## Setup

### 1) Configure Supabase
1. Create a project at https://supabase.com.
2. Open **Project Settings → API** and copy the Project URL and anon/public key into `config.js`.
3. Open **SQL Editor**, paste the complete contents of `supabase-schema.sql`, and run it. This creates or updates the `product_line` field, the X username lookup function, and the public aggregate product-line overview.
4. In **Authentication → Users**, create your store admin user.
5. Copy that user's UUID and run the commented `insert into public.store_admins` statement at the bottom of the SQL file, replacing the placeholder with the UUID.

### 2) Optional shopping page setup
1. Run the full updated `supabase-schema.sql` in the Supabase SQL Editor. It adds the shop catalog, settings, shopping orders, private payment-slip storage bucket and customer submission functions.
2. In the Admin dashboard, add products with a name, price, currency and product line.
3. Enter your shop bank details in the admin settings. These details are only returned to customers while the Shopping Page is enabled.
4. Turn on **Visible to customers** to publish the Shopping Page tab. Turn it off whenever you are taking orders through DMs.
5. Shopping-page submissions are created with status `waiting_confirmation`. Open the payment slip from the Admin dashboard, check your actual bank account, then choose **Confirm bank payment & complete**. The customer will see the completed order in Track My Orders.

### 3) Add and update orders
Open the **Admin** button and sign in. Add the order ID, customer details, customer's Twitter/X username, product line, item summary and status. Product-line names should be consistent (for example, always use `Summer Collection`, not several spelling variations) so they appear as one line in the public overview.

### 4) Publish on GitHub Pages
1. Create a GitHub repository, e.g. `peachy-orders`.
2. Upload all files in this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

## Privacy note
Twitter/X usernames are public and guessable. Anyone who knows a username can retrieve the customer-facing order records associated with it. The product overview is aggregate-only and does not reveal customer names or individual orders. Do not put addresses, phone numbers, email addresses or sensitive payment details in customer-visible fields. Consider adding a private lookup PIN before using this with sensitive order information.

## Security
- Supabase Row Level Security limits full order-table access to users listed in `store_admins`.
- The browser uses only the Supabase anon/public key; never put a service-role key in `config.js`. Payment slips are stored in a private Supabase Storage bucket; only store admins can view them. Customers can upload a slip, but cannot list or read other customers’ slips.
- Public customer lookup and public product-line overview use restricted database functions.
