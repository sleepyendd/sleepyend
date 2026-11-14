-- Run this script in Supabase Dashboard > SQL Editor.
-- If you already ran the earlier Peachy Orders schema, this safely adds customer_x_id
-- and replaces the old public lookup function.
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  customer_name text not null,
  customer_x_id text not null default '',
  product_line text not null default 'Uncategorized',
  items text,
  total numeric(12,2) not null default 0,
  currency text not null default 'THB',
  status text not null default 'pending_payment' check (status in ('pending_payment','payment_received','processing','purchased','preparing_shipment','shipped','completed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  carrier text,
  tracking_number text,
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists customer_x_id text not null default '';
alter table public.orders add column if not exists product_line text not null default 'Uncategorized';
create index if not exists orders_customer_x_id_idx on public.orders (lower(customer_x_id));

create table if not exists public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.orders enable row level security;
alter table public.store_admins enable row level security;

create or replace function public.is_store_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_admins where user_id = (select auth.uid()));
$$;

drop policy if exists "Store admins can manage orders" on public.orders;
create policy "Store admins can manage orders" on public.orders
  for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists "Admins can read own membership" on public.store_admins;
create policy "Admins can read own membership" on public.store_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Remove the previous Order-ID lookup function.
drop function if exists public.get_order_tracking(text);
drop function if exists public.get_orders_by_x_id(text);

-- Public lookup returns only customer-facing fields for every order matching an X username.
-- IMPORTANT: X usernames are public and guessable. Anyone can search a known username.
-- Do not store addresses, phone numbers, email addresses or private payment details in returned fields.
create function public.get_orders_by_x_id(p_customer_x_id text)
returns table (
  order_id text,
  customer_name text,
  product_line text,
  items text,
  total numeric,
  currency text,
  status text,
  payment_status text,
  carrier text,
  tracking_number text,
  customer_note text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_id, o.customer_name, o.product_line, o.items, o.total, o.currency, o.status,
         o.payment_status, o.carrier, o.tracking_number, o.customer_note, o.updated_at
  from public.orders o
  where lower(regexp_replace(trim(coalesce(o.customer_x_id, '')), '^@+', '')) =
        lower(regexp_replace(trim(coalesce(p_customer_x_id, '')), '^@+', ''))
    and trim(coalesce(p_customer_x_id, '')) <> ''
  order by o.created_at desc;
$$;

revoke all on function public.get_orders_by_x_id(text) from public;
grant execute on function public.get_orders_by_x_id(text) to anon, authenticated;

-- After creating your account under Authentication > Users, copy its UUID and run:
-- insert into public.store_admins (user_id) values ('PASTE-YOUR-AUTH-USER-UUID-HERE');


-- Public aggregate overview by product line. No customer-level information is exposed.
drop function if exists public.get_product_line_overview();
create function public.get_product_line_overview()
returns table (
  product_line text,
  total_orders bigint,
  pending_payment_count bigint,
  payment_received_count bigint,
  processing_count bigint,
  purchased_count bigint,
  preparing_shipment_count bigint,
  shipped_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  last_updated timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(o.product_line), ''), 'Uncategorized') as product_line,
         count(*) as total_orders,
         count(*) filter (where o.status = 'pending_payment') as pending_payment_count,
         count(*) filter (where o.status = 'payment_received') as payment_received_count,
         count(*) filter (where o.status = 'processing') as processing_count,
         count(*) filter (where o.status = 'purchased') as purchased_count,
         count(*) filter (where o.status = 'preparing_shipment') as preparing_shipment_count,
         count(*) filter (where o.status = 'shipped') as shipped_count,
         count(*) filter (where o.status = 'completed') as completed_count,
         count(*) filter (where o.status = 'cancelled') as cancelled_count,
         max(o.updated_at) as last_updated
  from public.orders o
  group by coalesce(nullif(trim(o.product_line), ''), 'Uncategorized')
  order by max(o.updated_at) desc, product_line asc;
$$;
revoke all on function public.get_product_line_overview() from public;
grant execute on function public.get_product_line_overview() to anon, authenticated;

-- OPTIONAL SHOPPING PAGE (migration for the optional customer storefront)
-- Run this whole file in Supabase SQL Editor after deploying the updated site.

create table if not exists public.shop_settings (
  id integer primary key default 1 check (id = 1),
  shopping_enabled boolean not null default false,
  bank_name text not null default '',
  bank_account_name text not null default '',
  bank_account_number text not null default '',
  payment_instructions text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id, shopping_enabled) values (1, false) on conflict (id) do nothing;

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric(12,2) not null check (price > 0),
  currency text not null default 'THB',
  product_line text not null default 'Shopping page',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  customer_x_id text not null,
  items jsonb not null,
  total numeric(12,2) not null,
  currency text not null default 'THB',
  payment_slip_path text not null,
  status text not null default 'waiting_confirmation' check (status in ('waiting_confirmation','completed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_customer_x_id_idx on public.shop_orders (lower(customer_x_id));

alter table public.shop_settings enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_orders enable row level security;

drop policy if exists "Store admins manage shop settings" on public.shop_settings;
create policy "Store admins manage shop settings" on public.shop_settings
  for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
drop policy if exists "Store admins manage shop products" on public.shop_products;
create policy "Store admins manage shop products" on public.shop_products
  for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
drop policy if exists "Store admins read shop orders" on public.shop_orders;
create policy "Store admins read shop orders" on public.shop_orders
  for select to authenticated using (public.is_store_admin());
drop policy if exists "Store admins update shop orders" on public.shop_orders;
create policy "Store admins update shop orders" on public.shop_orders
  for update to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

-- Private payment-slip bucket. Customers can upload a slip but cannot list or read slips.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Customers can upload payment slips" on storage.objects;
create policy "Customers can upload payment slips" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-slips' and name ~* '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$');
drop policy if exists "Store admins can view payment slips" on storage.objects;
create policy "Store admins can view payment slips" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-slips' and public.is_store_admin());
drop policy if exists "Store admins can delete payment slips" on storage.objects;
create policy "Store admins can delete payment slips" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-slips' and public.is_store_admin());

-- Only publish product information when the admin has enabled the optional shop.
drop function if exists public.get_public_shop_settings();
create function public.get_public_shop_settings()
returns table (shopping_enabled boolean, bank_name text, bank_account_name text, bank_account_number text, payment_instructions text)
language sql stable security definer set search_path = '' as $$
  select s.shopping_enabled,
         case when s.shopping_enabled then s.bank_name else '' end,
         case when s.shopping_enabled then s.bank_account_name else '' end,
         case when s.shopping_enabled then s.bank_account_number else '' end,
         case when s.shopping_enabled then s.payment_instructions else '' end
  from public.shop_settings s where s.id = 1;
$$;
revoke all on function public.get_public_shop_settings() from public;
grant execute on function public.get_public_shop_settings() to anon, authenticated;

drop function if exists public.get_public_shop_products();
create function public.get_public_shop_products()
returns table (id uuid, name text, description text, price numeric, currency text, product_line text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,p.description,p.price,p.currency,p.product_line
  from public.shop_products p
  where p.is_active = true and exists (select 1 from public.shop_settings s where s.id=1 and s.shopping_enabled=true)
  order by p.created_at desc;
$$;
revoke all on function public.get_public_shop_products() from public;
grant execute on function public.get_public_shop_products() to anon, authenticated;

-- Customer order submission: server recalculates totals from the live product catalog.
drop function if exists public.submit_shop_order(text,jsonb,text);
create function public.submit_shop_order(p_customer_x_id text, p_items jsonb, p_slip_path text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_x text;
  v_item jsonb;
  v_product public.shop_products%rowtype;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_currency text := null;
  v_snapshot jsonb := '[]'::jsonb;
  v_order_id text;
begin
  v_x := lower(regexp_replace(trim(coalesce(p_customer_x_id,'')), '^@+', ''));
  if v_x = '' or length(v_x) > 50 or v_x !~ '^[a-z0-9_]+$' then raise exception 'Please enter a valid Twitter/X username.'; end if;
  if not exists (select 1 from public.shop_settings s where s.id=1 and s.shopping_enabled=true) then raise exception 'The shopping page is currently closed.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Your cart is empty or contains too many products.'; end if;
  if p_slip_path !~* '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$' then raise exception 'Invalid payment slip upload.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='payment-slips' and o.name=p_slip_path) then raise exception 'Payment slip upload not found. Please upload it again.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Invalid product quantity.'; end if;
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.shop_products p where p.id::text = v_item->>'product_id' and p.is_active=true;
    if not found then raise exception 'One of the selected products is no longer available.'; end if;
    if v_currency is null then v_currency := v_product.currency; elsif v_currency <> v_product.currency then raise exception 'Please place products with different currencies in separate orders.'; end if;
    v_total := v_total + (v_product.price * v_qty);
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('name',v_product.name,'product_line',v_product.product_line,'quantity',v_qty,'unit_price',v_product.price,'currency',v_product.currency));
  end loop;
  v_order_id := 'SHOP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.shop_orders(order_id,customer_x_id,items,total,currency,payment_slip_path,status,payment_status)
  values(v_order_id,v_x,v_snapshot,v_total,coalesce(v_currency,'THB'),p_slip_path,'waiting_confirmation','unpaid');
  return v_order_id;
end;
$$;
revoke all on function public.submit_shop_order(text,jsonb,text) from public;
grant execute on function public.submit_shop_order(text,jsonb,text) to anon, authenticated;

-- Extend the existing customer X-username lookup to include shopping-page orders.
drop function if exists public.get_orders_by_x_id(text);
create function public.get_orders_by_x_id(p_customer_x_id text)
returns table (
  order_id text, customer_name text, product_line text, items text, total numeric, currency text,
  status text, payment_status text, carrier text, tracking_number text, customer_note text, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select o.order_id,o.customer_name,o.product_line,o.items,o.total,o.currency,o.status,o.payment_status,
         o.carrier,o.tracking_number,o.customer_note,o.updated_at
  from public.orders o
  where lower(regexp_replace(trim(coalesce(o.customer_x_id,'')), '^@+', '')) = lower(regexp_replace(trim(coalesce(p_customer_x_id,'')), '^@+', ''))
    and trim(coalesce(p_customer_x_id,'')) <> ''
  union all
  select so.order_id,('@' || so.customer_x_id)::text,'Shopping page',
         (select string_agg((item->>'name') || ' × ' || (item->>'quantity'), ', ') from jsonb_array_elements(so.items) item),
         so.total,so.currency,so.status,so.payment_status,null::text,null::text,
         'Your payment is waiting for the store to confirm the bank transfer.'::text,so.updated_at
  from public.shop_orders so
  where lower(regexp_replace(trim(coalesce(so.customer_x_id,'')), '^@+', '')) = lower(regexp_replace(trim(coalesce(p_customer_x_id,'')), '^@+', ''))
    and trim(coalesce(p_customer_x_id,'')) <> ''
  order by updated_at desc;
$$;
revoke all on function public.get_orders_by_x_id(text) from public;
grant execute on function public.get_orders_by_x_id(text) to anon, authenticated;

-- Include optional-shop purchases in the product-line aggregate shown on the public overview.
drop function if exists public.get_product_line_overview();
create function public.get_product_line_overview()
returns table (
  product_line text,total_orders bigint,waiting_confirmation_count bigint,pending_payment_count bigint,payment_received_count bigint,
  processing_count bigint,purchased_count bigint,preparing_shipment_count bigint,shipped_count bigint,
  completed_count bigint,cancelled_count bigint,last_updated timestamptz
)
language sql stable security definer set search_path = '' as $$
  with all_order_lines as (
    select o.order_id,coalesce(nullif(trim(o.product_line),''),'Uncategorized') as product_line,o.status,o.updated_at from public.orders o
    union all
    select so.order_id,coalesce(nullif(trim(item->>'product_line'),''),'Shopping page'),so.status,so.updated_at
    from public.shop_orders so cross join lateral jsonb_array_elements(so.items) item
  )
  select a.product_line,count(distinct a.order_id) as total_orders,
    count(distinct a.order_id) filter(where a.status='waiting_confirmation') as waiting_confirmation_count,
    count(distinct a.order_id) filter(where a.status='pending_payment') as pending_payment_count,
    count(distinct a.order_id) filter(where a.status='payment_received') as payment_received_count,
    count(distinct a.order_id) filter(where a.status='processing') as processing_count,
    count(distinct a.order_id) filter(where a.status='purchased') as purchased_count,
    count(distinct a.order_id) filter(where a.status='preparing_shipment') as preparing_shipment_count,
    count(distinct a.order_id) filter(where a.status='shipped') as shipped_count,
    count(distinct a.order_id) filter(where a.status='completed') as completed_count,
    count(distinct a.order_id) filter(where a.status='cancelled') as cancelled_count,
    max(a.updated_at) as last_updated
  from all_order_lines a group by a.product_line order by max(a.updated_at) desc,a.product_line asc;
$$;
revoke all on function public.get_product_line_overview() from public;
grant execute on function public.get_product_line_overview() to anon, authenticated;
