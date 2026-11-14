(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('shop-panel')) return;
  let shopProducts = [], adminProducts = [], cart = [], shopSettings = null, adminShopOrders = [];
  const escapeHTML = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = (s='') => String(s).trim().replace(/^@+/, '').toLowerCase();
  const money = (n,c='THB') => `${c} ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const db = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes('YOUR-PROJECT') && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE') ? window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY) : null;
  const setAdminMessage = (msg,bad=false) => { const el=$('admin-message'); if(!el)return; el.textContent=msg; el.classList.remove('hidden','bad'); if(bad)el.classList.add('bad'); };

  // The optional customer tab is only rendered when the admin enables it in store settings.
  async function loadPublicShop() {
    if (!db) { $('tab-shop').classList.add('hidden'); return; }
    const {data,error}=await db.rpc('get_public_shop_settings');
    const settings=Array.isArray(data)?data[0]:data;
    if(error || !settings || !settings.shopping_enabled) { $('tab-shop').classList.add('hidden'); return; }
    shopSettings=settings; $('tab-shop').classList.remove('hidden');
    $('shop-bank-details').innerHTML=`<strong>Payment by bank transfer</strong><div class="bank-detail-row"><span>Bank</span><b>${escapeHTML(settings.bank_name||'—')}</b></div><div class="bank-detail-row"><span>Account name</span><b>${escapeHTML(settings.bank_account_name||'—')}</b></div><div class="bank-detail-row"><span>Account number</span><b>${escapeHTML(settings.bank_account_number||'—')}</b></div>${settings.payment_instructions?`<p>${escapeHTML(settings.payment_instructions)}</p>`:''}`;
    await loadPublicProducts();
  }
  async function loadPublicProducts(){
    const {data,error}=await db.rpc('get_public_shop_products');
    if(error){$('shop-products').innerHTML='<p class="error">Products are temporarily unavailable. Please try again later.</p>';return;}
    shopProducts=data||[];
    $('shop-products').innerHTML=shopProducts.length?shopProducts.map(p=>`<article class="shop-product-card"><div class="shop-product-art">♡</div><div class="shop-product-info"><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description||p.product_line||'A little something for you')}</p><strong>${money(p.price,p.currency)}</strong><button class="small-action add-to-cart" data-product="${p.id}">Add to cart ＋</button></div></article>`).join(''):'<div class="empty-products">No products are available right now. Please check back soon ♡</div>';
  }
  function renderCart(){
    const count=cart.reduce((n,x)=>n+x.quantity,0); $('cart-count').textContent=`${count} item${count===1?'':'s'}`;
    $('cart-items').innerHTML=cart.length?cart.map(x=>`<div class="cart-line"><div><strong>${escapeHTML(x.name)}</strong><small>${money(x.price,x.currency)} each</small></div><div class="quantity-control"><button type="button" data-minus="${x.id}" aria-label="Decrease quantity">−</button><b>${x.quantity}</b><button type="button" data-plus="${x.id}" aria-label="Increase quantity">＋</button><button type="button" class="remove-cart" data-remove="${x.id}" aria-label="Remove item">×</button></div></div>`).join(''):'<p class="muted">Your cart is waiting for something cute.</p>';
    const total=cart.reduce((n,x)=>n+x.price*x.quantity,0); const currency=cart[0]?.currency||'THB'; $('cart-total').textContent=money(total,currency);
    $('shop-summary').innerHTML=`<strong>Order summary</strong>${cart.length?cart.map(x=>`<div class="summary-line"><span>${escapeHTML(x.name)} × ${x.quantity}</span><b>${money(x.price*x.quantity,x.currency)}</b></div>`).join(''):`<p class="muted">Your selected items will appear here.</p>`}<div class="summary-line summary-grand"><span>Total</span><b>${money(total,currency)}</b></div>`;
    $('submit-shop-order').disabled=!cart.length;
  }
  $('shop-products').addEventListener('click',e=>{const id=e.target.dataset.product;if(!id)return;const p=shopProducts.find(x=>x.id===id);if(!p)return;const existing=cart.find(x=>x.id===id);if(existing)existing.quantity++;else cart.push({id:p.id,name:p.name,price:Number(p.price),currency:p.currency,quantity:1});renderCart();});
  $('cart-items').addEventListener('click',e=>{const id=e.target.dataset.plus||e.target.dataset.minus||e.target.dataset.remove;if(!id)return;const item=cart.find(x=>x.id===id);if(!item)return;if(e.target.dataset.plus)item.quantity++;else if(e.target.dataset.minus)item.quantity--;else item.quantity=0;cart=cart.filter(x=>x.quantity>0);renderCart();});
  $('shop-checkout-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(!db)return alert('The shop is not connected yet. Please try again later.');
    const username=normalize($('shop-customer-x').value), file=$('payment-slip').files[0];
    if(!username)return alert('Please enter your Twitter / X username.'); if(!cart.length)return alert('Please add at least one product to your cart.');
    if(!file)return alert('Please upload your payment slip.'); if(file.size>5*1024*1024)return alert('Your payment slip must be 5 MB or smaller.');
    const allowed=['image/jpeg','image/png','image/webp','application/pdf']; if(!allowed.includes(file.type))return alert('Please upload a JPG, PNG, WEBP or PDF file.');
    const btn=$('submit-shop-order');btn.disabled=true;btn.textContent='Submitting…';
    try {
      const slipId=crypto.randomUUID(); const ext=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'bin'; const slipPath=`${slipId}.${ext}`;
      const upload=await db.storage.from('payment-slips').upload(slipPath,file,{upsert:false,contentType:file.type});
      if(upload.error)throw upload.error;
      const {data,error}=await db.rpc('submit_shop_order',{p_customer_x_id:username,p_items:cart.map(x=>({product_id:x.id,quantity:x.quantity})),p_slip_path:slipPath});
      if(error){await db.storage.from('payment-slips').remove([slipPath]);throw error;}
      $('shop-checkout-form').reset();cart=[];renderCart();alert(`Thank you! Your order ${data} has been submitted and is now waiting for payment confirmation. You can check it on Track My Orders using @${username}.`);
    } catch(err) { alert(err.message||'We could not submit your order. Please try again.'); }
    finally {btn.disabled=!cart.length;btn.textContent='Submit order ♡';}
  });

  // Admin settings, product catalog and payment-slip verification.
  async function loadAdminShop(){ if(!db)return; const {data,error}=await db.from('shop_settings').select('*').eq('id',1).maybeSingle(); if(error){setAdminMessage(error.message,true);return;} if(data){$('shop-enabled').checked=!!data.shopping_enabled;$('shop-bank-name').value=data.bank_name||'';$('shop-bank-account-name').value=data.bank_account_name||'';$('shop-bank-account-number').value=data.bank_account_number||'';$('shop-bank-instructions').value=data.payment_instructions||'';} await loadAdminProducts();await loadAdminShopOrders(); }
  async function loadAdminProducts(){const {data,error}=await db.from('shop_products').select('*').order('created_at',{ascending:false});if(error){$('shop-admin-products').innerHTML=`<p class="error">${escapeHTML(error.message)}</p>`;return;} adminProducts=data||[]; $('shop-admin-products').innerHTML=adminProducts.map(p=>`<div class="shop-admin-product"><div><b>${escapeHTML(p.name)}</b><small>${money(p.price,p.currency)} · ${p.is_active?'Visible':'Hidden'}</small></div><div><button class="small-action" data-product-edit="${p.id}">Edit</button><button class="small-action" data-product-toggle="${p.id}">${p.is_active?'Hide':'Show'}</button></div></div>`).join('')||'<p class="muted">No products added yet.</p>'; }
  $('shop-product-form').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const id=$('shop-product-id').value;const payload={name:$('shop-product-name').value.trim(),description:$('shop-product-description').value.trim(),price:Number($('shop-product-price').value),currency:$('shop-product-currency').value,product_line:$('shop-product-line').value.trim()||'Shopping page'};const result=id?await db.from('shop_products').update(payload).eq('id',id):await db.from('shop_products').insert(payload);if(result.error){setAdminMessage(result.error.message,true);return;}resetProductForm();setAdminMessage('Shop product saved ♡');await loadAdminProducts();if(!$('tab-shop').classList.contains('hidden'))await loadPublicProducts();});
  function resetProductForm(){$('shop-product-form').reset();$('shop-product-id').value='';$('shop-product-save').textContent='Add product';$('shop-product-cancel').classList.add('hidden');}
  $('shop-product-cancel').addEventListener('click',resetProductForm);
  $('shop-admin-products').addEventListener('click',async e=>{const edit=e.target.dataset.productEdit,toggle=e.target.dataset.productToggle;if(edit){const p=adminProducts.find(x=>x.id===edit);if(!p)return;$('shop-product-id').value=p.id;$('shop-product-name').value=p.name;$('shop-product-description').value=p.description||'';$('shop-product-price').value=p.price;$('shop-product-currency').value=p.currency;$('shop-product-line').value=p.product_line||'';$('shop-product-save').textContent='Save changes';$('shop-product-cancel').classList.remove('hidden');}if(toggle){const p=adminProducts.find(x=>x.id===toggle);if(!p)return;const {error}=await db.from('shop_products').update({is_active:!p.is_active}).eq('id',toggle);if(error)setAdminMessage(error.message,true);else{await loadAdminProducts();await loadPublicProducts();}}});
  $('shop-enabled').addEventListener('change',async e=>{const {error}=await db.from('shop_settings').upsert({id:1,shopping_enabled:e.target.checked,updated_at:new Date().toISOString()});if(error){e.target.checked=!e.target.checked;setAdminMessage(error.message,true);}else{setAdminMessage(e.target.checked?'Shopping page is now visible to customers ♡':'Shopping page is now hidden from customers ♡');await loadPublicShop();}});
  $('shop-settings-form').addEventListener('submit',async e=>{e.preventDefault();const payload={id:1,bank_name:$('shop-bank-name').value.trim(),bank_account_name:$('shop-bank-account-name').value.trim(),bank_account_number:$('shop-bank-account-number').value.trim(),payment_instructions:$('shop-bank-instructions').value.trim(),updated_at:new Date().toISOString()};const {error}=await db.from('shop_settings').upsert(payload);if(error)setAdminMessage(error.message,true);else{setAdminMessage('Shop payment details saved ♡');await loadPublicShop();}});
  async function loadAdminShopOrders(){const {data,error}=await db.from('shop_orders').select('*').order('created_at',{ascending:false}).limit(100);if(error){$('shop-admin-orders').innerHTML=`<p class="error">${escapeHTML(error.message)}</p>`;return;}adminShopOrders=data||[];$('shop-admin-orders').innerHTML=adminShopOrders.length?adminShopOrders.map(o=>`<article class="shop-admin-order"><div class="shop-admin-order-top"><div><b>${escapeHTML(o.order_id)}</b><small>@${escapeHTML(o.customer_x_id)} · ${money(o.total,o.currency)}</small></div><span class="status-pill">${escapeHTML(o.status==='waiting_confirmation'?'Waiting confirmation':o.status)}</span></div><p>${escapeHTML((o.items||[]).map(x=>`${x.name} × ${x.quantity}`).join(', '))}</p><div class="shop-admin-order-actions"><button class="small-action" data-slip="${o.id}">View payment slip</button>${o.status!=='completed'?`<button class="small-action confirm-shop-order" data-confirm="${o.id}">Confirm bank payment & complete</button>`:'<span class="muted">Completed</span>'}</div></article>`).join(''):'<p class="muted">No shopping orders yet.</p>';}
  $('refresh-shop-orders').addEventListener('click',loadAdminShopOrders);
  $('shop-admin-orders').addEventListener('click',async e=>{const slip=e.target.dataset.slip,confirmId=e.target.dataset.confirm;if(slip){const order=adminShopOrders.find(x=>x.id===slip);if(!order)return;const preview=window.open('about:blank','_blank');const {data,error}=await db.storage.from('payment-slips').createSignedUrl(order.payment_slip_path,300);if(error){if(preview)preview.close();setAdminMessage(error.message,true);return;}if(preview)preview.location.href=data.signedUrl;else setAdminMessage('Your browser blocked the preview window. Please allow pop-ups and try again.',true);}if(confirmId){if(!confirm('Have you checked your bank account and confirmed the transfer arrived? This will mark the order as completed.'))return;const {error}=await db.from('shop_orders').update({status:'completed',payment_status:'paid',updated_at:new Date().toISOString()}).eq('id',confirmId);if(error)setAdminMessage(error.message,true);else{setAdminMessage('Payment confirmed and order marked completed ♡');await loadAdminShopOrders();}}});

  // Tab is hidden until settings are fetched. Admin login triggers the private dashboard loaders.
  if(db){db.auth.onAuthStateChange((event,session)=>{if(session)setTimeout(loadAdminShop,0);});const originalOpen=$('open-admin').onclick;$('open-admin').addEventListener('click',()=>setTimeout(async()=>{const {data:{session}}=await db.auth.getSession();if(session)loadAdminShop();},250));}
  loadPublicShop();renderCart();
})();
