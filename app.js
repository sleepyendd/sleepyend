(() => {
  const $ = (id) => document.getElementById(id);
  const hasConfig = () => window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes('YOUR-PROJECT') && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  let db = null, currentOrders = [];
  const statuses = [
    ['waiting_confirmation','Waiting for confirmation'],['pending_payment','Pending payment'],['payment_received','Payment received'],['processing','Processing'],['purchased','Purchased'],['preparing_shipment','Preparing shipment'],['shipped','Shipped'],['completed','Completed'],['cancelled','Cancelled']
  ];
  const statusName = (s) => statuses.find(x => x[0] === s)?.[1] || s;
  const money = (n,c) => `${c || 'THB'} ${Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const escapeHTML = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const showMessage = (message,bad=false) => { $('admin-message').textContent=message; $('admin-message').classList.remove('hidden','bad'); if(bad)$('admin-message').classList.add('bad'); };
  const hideMessage = () => $('admin-message').classList.add('hidden');
  if (window.supabase && hasConfig()) db = window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);

  function activateTab(tab){
    const tracking=tab==='track', products=tab==='products', shop=tab==='shop';
    $('tab-track').classList.toggle('active',tracking); $('tab-products').classList.toggle('active',products); $('tab-shop').classList.toggle('active',shop);
    $('tab-track').setAttribute('aria-selected',String(tracking)); $('tab-products').setAttribute('aria-selected',String(products)); $('tab-shop').setAttribute('aria-selected',String(shop));
    $('track-panel').classList.toggle('hidden',!tracking); $('result').classList.toggle('hidden',!tracking || $('order-result').innerHTML==='');
    $('products-panel').classList.toggle('hidden',!products); $('shop-panel').classList.toggle('hidden',!shop);
    if(products) loadProductOverview();
  }
  window.peachyActivateTab=activateTab;
  $('tab-track').addEventListener('click',()=>activateTab('track'));
  $('tab-products').addEventListener('click',()=>activateTab('products'));
  $('tab-shop').addEventListener('click',()=>activateTab('shop'));
  async function loadProductOverview(){
    $('product-overview').innerHTML='<p class="muted">Loading product updates…</p>';
    if(!db){$('product-overview').innerHTML='<div class="empty-products">Product updates will appear here once the store connects its order database.</div>';return;}
    const {data,error}=await db.rpc('get_product_line_overview');
    if(error){$('product-overview').innerHTML='<div class="error">We couldn’t load product updates right now. Please try again later.</div>';return;}
    if(!data || data.length===0){$('product-overview').innerHTML='<div class="empty-products">No product updates yet. Please check back soon ♡</div>';return;}
    $('product-overview').innerHTML=data.map(renderProductLine).join('');
  }
  function renderProductLine(p){
    const count=(key)=>Number(p[key]||0);
    const visible=[['Waiting confirmation','waiting_confirmation_count'],['Pending payment','pending_payment_count'],['Payment received','payment_received_count'],['Processing','processing_count'],['Purchased','purchased_count'],['Preparing shipment','preparing_shipment_count'],['Shipped','shipped_count'],['Completed','completed_count'],['Cancelled','cancelled_count']].filter(([,key])=>count(key)>0);
    return `<article class="product-card"><div class="product-card-top"><h3>${escapeHTML(p.product_line)}</h3><span class="product-total">${Number(p.total_orders)} orders</span></div><div class="product-status-list">${visible.map(([label,key])=>`<span class="product-status">${escapeHTML(label)} <b>${count(key)}</b></span>`).join('')}</div><div class="product-updated">Last updated: ${p.last_updated?new Date(p.last_updated).toLocaleString():'—'}</div></article>`;
  }

  $('lookup-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const handle=normalizeXId($('customer-x-id').value); if(!handle)return;
    $('result').classList.remove('hidden'); $('order-result').innerHTML='<p class="muted">Looking up your order…</p>';
    $('result').scrollIntoView({behavior:'smooth',block:'start'});
    if(!db){$('order-result').innerHTML='<div class="error">The order tracker is not connected yet. The store owner needs to finish the Supabase setup.</div>';return;}
    const {data,error}=await db.rpc('get_orders_by_x_id',{p_customer_x_id:handle});
    if(error){$('order-result').innerHTML='<div class="error">Sorry, we couldn’t check that order right now. Please try again in a moment.</div>';return;}
    if(!data || data.length===0){$('order-result').innerHTML='<div class="error">No orders found for that X username. Check the spelling and try again.</div>';return;}
    $('order-result').innerHTML=`<div class="lookup-summary">FOUND ${data.length} ORDER${data.length===1?'':'S'} FOR @${escapeHTML(handle)}</div>`+data.map(renderCustomerOrder).join('');
  });
  $('clear-result').addEventListener('click',()=>{$('result').classList.add('hidden');$('customer-x-id').value='';$('customer-x-id').focus();});
  function normalizeXId(value){return String(value||'').trim().replace(/^@+/,'').toLowerCase();}
  function renderCustomerOrder(o){
    const progression=['payment_received','processing','purchased','preparing_shipment','shipped','completed'];
    const idx=progression.indexOf(o.status);
    const steps=[['payment_received','Payment'],['processing','Processing'],['preparing_shipment','Packing'],['shipped','Shipped']];
    const timeline=o.status==='waiting_confirmation'?'<div class="timeline-step current">Waiting for payment confirmation</div><div class="timeline-step">Payment verified</div><div class="timeline-step">Order completed</div>':steps.map(([key,label],i)=>`<div class="timeline-step ${o.status==='cancelled'?'':(idx>=progression.indexOf(key)?'done':'') } ${o.status===key?'current':''}">${label}</div>`).join('');
    return `<article class="order-card"><div class="order-top"><div><div class="order-id">ORDER ${escapeHTML(o.order_id)}</div><div class="order-customer">${escapeHTML(o.customer_name || 'Customer')}</div><div class="muted">${escapeHTML(o.product_line || 'Your order')} · status update</div></div><span class="status-pill">${escapeHTML(statusName(o.status))}</span></div><div class="timeline">${timeline}</div><div class="order-meta"><div><div class="meta-label">ORDER SUMMARY</div><div class="meta-value">${escapeHTML(o.items || 'Order details coming soon')}</div></div><div><div class="meta-label">ORDER TOTAL</div><div class="meta-value">${escapeHTML(money(o.total,o.currency))}</div></div><div><div class="meta-label">PAYMENT</div><div class="meta-value">${escapeHTML((o.payment_status||'').replace('_',' '))}</div></div><div><div class="meta-label">LAST UPDATED</div><div class="meta-value">${o.updated_at?new Date(o.updated_at).toLocaleString(): '—'}</div></div>${o.carrier||o.tracking_number?`<div><div class="meta-label">SHIPPING</div><div class="meta-value">${escapeHTML(o.carrier||'')}</div></div><div><div class="meta-label">TRACKING NUMBER</div><div class="meta-value">${escapeHTML(o.tracking_number||'Not available yet')}</div></div>`:''}</div>${o.customer_note?`<div class="customer-note"><b>STORE MESSAGE // </b>${escapeHTML(o.customer_note)}</div>`:''}</article>`;
  }

  $('open-admin').addEventListener('click',()=>{$('admin-modal').classList.remove('hidden');hideMessage();if(!db)showMessage('Connect Supabase first: add your project URL and anon key in config.js, then reload.',true);});
  $('close-admin').addEventListener('click',()=>$('admin-modal').classList.add('hidden'));
  $('admin-modal').addEventListener('click',e=>{if(e.target===$('admin-modal'))$('admin-modal').classList.add('hidden');});
  $('login-form').addEventListener('submit',async e=>{e.preventDefault();if(!db)return showMessage('Supabase is not configured yet.',true);const {error}=await db.auth.signInWithPassword({email:$('admin-email').value,password:$('admin-password').value});if(error)return showMessage(error.message,true);await checkSession();});
  async function checkSession(){if(!db)return;const {data:{session}}=await db.auth.getSession();$('auth-panel').classList.toggle('hidden',!!session);$('dashboard').classList.toggle('hidden',!session);if(session){$('admin-welcome').textContent=`Signed in as ${session.user.email}`;await loadOrders();}}
  $('sign-out').addEventListener('click',async()=>{await db.auth.signOut();$('dashboard').classList.add('hidden');$('auth-panel').classList.remove('hidden');resetForm();});
  async function loadOrders(){const {data,error}=await db.from('orders').select('*').order('created_at',{ascending:false}).limit(100);if(error){$('admin-orders').innerHTML=`<p class="error">${escapeHTML(error.message)}</p>`;return;}currentOrders=data||[];renderAdminOrders();}
  function renderAdminOrders(){const q=$('admin-search').value.toLowerCase();const rows=currentOrders.filter(o=>`${o.order_id} ${o.customer_name} ${o.customer_x_id||''} ${o.product_line||''}`.toLowerCase().includes(q));$('admin-orders').innerHTML=rows.length?rows.map(o=>`<div class="admin-order"><div><strong>${escapeHTML(o.order_id)} · ${escapeHTML(o.customer_name)}<br><small>@${escapeHTML(o.customer_x_id||'no X ID')}</small></strong><small>${escapeHTML(o.product_line||'Uncategorized')} · ${escapeHTML(statusName(o.status))} · ${escapeHTML(money(o.total,o.currency))}</small></div><div class="admin-order-actions"><button class="small-action" data-edit="${escapeHTML(o.id)}">Edit</button></div></div>`).join(''):'<p class="muted">No matching orders yet. Add your first order!</p>';}
  $('admin-orders').addEventListener('click',e=>{const id=e.target.dataset.edit;if(id)editOrder(currentOrders.find(o=>String(o.id)===id));});
  $('admin-search').addEventListener('input',renderAdminOrders);$('refresh-orders').addEventListener('click',loadOrders);
  function editOrder(o){if(!o)return;$('form-heading').textContent='✎ Edit order';$('edit-id').value=o.id;$('new-order-id').value=o.order_id;$('new-order-id').disabled=true;$('customer-name').value=o.customer_name||'';$('admin-customer-x-id').value=o.customer_x_id||'';$('product-line').value=o.product_line||'';$('items').value=o.items||'';$('total').value=o.total||'';$('currency').value=o.currency||'THB';$('status').value=o.status;$('payment-status').value=o.payment_status||'unpaid';$('carrier').value=o.carrier||'';$('tracking-number').value=o.tracking_number||'';$('customer-note').value=o.customer_note||'';$('save-order').textContent='Update order';$('cancel-edit').classList.remove('hidden');$('order-form').scrollIntoView({behavior:'smooth',block:'start'});}
  function resetForm(){$('order-form').reset();$('edit-id').value='';$('new-order-id').disabled=false;$('form-heading').textContent='＋ Add an order';$('save-order').textContent='Save order';$('cancel-edit').classList.add('hidden');}
  $('cancel-edit').addEventListener('click',resetForm);
  $('order-form').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const id=$('edit-id').value;const payload={order_id:$('new-order-id').value.trim(),customer_name:$('customer-name').value.trim(),customer_x_id:normalizeXId($('admin-customer-x-id').value),product_line:$('product-line').value.trim(),items:$('items').value.trim(),total:Number($('total').value||0),currency:$('currency').value,status:$('status').value,payment_status:$('payment-status').value,carrier:$('carrier').value.trim(),tracking_number:$('tracking-number').value.trim(),customer_note:$('customer-note').value.trim(),updated_at:new Date().toISOString()};const result=id?await db.from('orders').update(payload).eq('id',id):await db.from('orders').insert(payload);if(result.error){showMessage(result.error.message,true);return;}showMessage(id?'Order updated successfully ♡':'New order added ♡');resetForm();await loadOrders();if(!$('products-panel').classList.contains('hidden'))await loadProductOverview();});
  if(db)db.auth.onAuthStateChange(()=>{setTimeout(checkSession,0);});
  checkSession();
})();
