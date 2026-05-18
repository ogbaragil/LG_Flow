import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase, isSupabaseConfigured, supabaseConfigSource } from './supabaseClient';

const STORAGE_KEY = 'lg_flow_pwa_v2_premium';
const TABS = ['Dashboard', 'Clients', 'Invoices', 'Transactions', 'Settings'];
const EMPTY_BUSINESS = {
  name: '',
  abn: '',
  email: '',
  phone: '',
  address: '',
  paymentDetails: '',
  logoUrl: '',
};
const ITEMS = [
  { label: 'Self-Care Support', rate: 70.23, unitType: 'hours' },
  { label: 'Community Access', rate: 70.23, unitType: 'hours' },
  { label: 'Transport', rate: 1, unitType: 'km' },
  { label: 'Establishment Fee for Personal Care/Participation', rate: 702.3, unitType: 'hours' },
];
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const makeId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const daysUntil = (dateStr) => { if (!dateStr) return null; const end = new Date(`${dateStr}T00:00:00`); if (Number.isNaN(end.getTime())) return null; return Math.ceil((end - new Date()) / 86400000); };
const fileToDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
const safeText = (value) => String(value ?? '');
const emptyClient = { name: '', ndisNumber: '', email: '', phone: '', address: '', planStartDate: '', planEndDate: '', budget: '' };
const emptyLine = () => ({ id: makeId('line'), itemLabel: ITEMS[0].label, serviceDate: todayISO(), unitType: 'hours', quantity: '1', rate: String(ITEMS[0].rate) });
const emptyInvoice = () => ({ clientId: '', dueDate: addDaysISO(7), notes: '', lines: [emptyLine()] });
const emptyTxn = { clientId: '', type: 'expense', status: 'pending', category: '', description: '', amount: '', date: todayISO() };
async function syncSnapshot(payload, user) {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  if (!user?.id) return { ok: false, message: 'Please sign in first.' };
  const { error } = await supabase.from('app_snapshots').upsert({
    id: user.id,
    user_id: user.id,
    payload,
    updated_at: new Date().toISOString(),
  });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Cloud sync complete.' };
}
async function loadSnapshot(user) {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  if (!user?.id) return { ok: false, message: 'Please sign in first.' };
  const { data, error } = await supabase.from('app_snapshots').select('payload').eq('id', user.id).single();
  if (error) {
    if (error.code === 'PGRST116') return { ok: true, payload: null, message: 'No cloud profile found yet.' };
    return { ok: false, message: error.message };
  }
  return { ok: true, payload: data?.payload };
}
const storageKeyFor = (user) => user?.id ? `${STORAGE_KEY}_${user.id}` : STORAGE_KEY;

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [business, setBusiness] = useState(EMPTY_BUSINESS);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice());
  const [txnForm, setTxnForm] = useState(emptyTxn);
  const [editingClient, setEditingClient] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editingTxn, setEditingTxn] = useState(null);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [cloudChecked, setCloudChecked] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { if (mounted) { setUser(data.session?.user || null); setAuthLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); });
    return () => { mounted = false; listener?.subscription?.unsubscribe(); };
  }, []);

  const applyPayload = (d) => {
    setBusiness({ ...EMPTY_BUSINESS, ...(d?.business || {}) });
    setClients(d?.clients || []);
    setInvoices(d?.invoices || []);
    setTransactions(d?.transactions || []);
  };

  useEffect(() => {
    if (authLoading || !user?.id) return;
    setStorageLoaded(false);
    try {
      const raw = localStorage.getItem(storageKeyFor(user));
      if (raw) applyPayload(JSON.parse(raw));
      else applyPayload({ business: EMPTY_BUSINESS, clients: [], invoices: [], transactions: [] });
    } catch {
      applyPayload({ business: EMPTY_BUSINESS, clients: [], invoices: [], transactions: [] });
    } finally {
      setStorageLoaded(true);
    }
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!storageLoaded || !user?.id) return;
    localStorage.setItem(storageKeyFor(user), JSON.stringify({ business, clients, invoices, transactions }));
  }, [storageLoaded, user?.id, business, clients, invoices, transactions]);

  const loadCloudData = async ({ silent = false } = {}) => {
    if (!user?.id) return { ok: false, message: 'Please sign in first.' };
    setCloudLoading(true);
    const r = await loadSnapshot(user);
    if (r.ok && r.payload) {
      applyPayload(r.payload);
      if (!silent) showNotice('Cloud data loaded.');
    } else if (!silent) {
      showNotice(r.message || 'No cloud data found yet.');
    }
    setCloudLoading(false);
    return r;
  };

  useEffect(() => {
    if (!storageLoaded || !user?.id) return;
    let cancelled = false;
    setCloudChecked(false);
    setCloudLoading(true);
    loadSnapshot(user).then((r) => {
      if (cancelled) return;
      if (r.ok && r.payload) applyPayload(r.payload);
      setCloudChecked(true);
      setCloudLoading(false);
    });
    return () => { cancelled = true; };
  }, [storageLoaded, user?.id]);

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const outstanding = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.total || 0), 0);
    const activeClients = clients.filter(c => !c.archived);
    const totalBudget = activeClients.reduce((s, c) => s + Number(c.budget || 0), 0);
    const invoicedTotal = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const remainingBudget = totalBudget - invoicedTotal;
    const expiringPlans = activeClients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; }).length;
    return { activeClients: activeClients.length, invoices: invoices.length, income, expenses, net: income - expenses, outstanding, totalBudget, invoicedTotal, remainingBudget, expiringPlans };
  }, [clients, invoices, transactions]);

  const filteredInvoices = invoices.filter(i => `${i.invoiceNumber} ${i.clientName}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const payload = { business, clients, invoices, transactions };
  const showNotice = (message) => { setNotice(message); setTimeout(() => setNotice(''), 4200); };

  const saveClient = () => {
    if (!clientForm.name.trim()) return alert('Please enter the client name.');
    if (editingClient) setClients(prev => prev.map(c => c.id === editingClient ? { ...c, ...clientForm, updatedAt: new Date().toISOString() } : c));
    else setClients(prev => [{ id: makeId('client'), archived: false, createdAt: new Date().toISOString(), ...clientForm }, ...prev]);
    setClientForm(emptyClient); setEditingClient(null); showNotice('Client profile saved.');
  };
  const editClient = (c) => { setClientForm({ name: c.name || '', ndisNumber: c.ndisNumber || '', email: c.email || '', phone: c.phone || '', address: c.address || '', planStartDate: c.planStartDate || '', planEndDate: c.planEndDate || '', budget: String(c.budget ?? '') }); setEditingClient(c.id); setActive('Clients'); window.scrollTo(0, 0); };
  const archiveClient = (cid) => setClients(prev => prev.map(c => c.id === cid ? { ...c, archived: !c.archived } : c));
  const deleteClient = (cid) => invoices.some(i => i.clientId === cid) ? alert('This client has invoices and cannot be deleted.') : setClients(prev => prev.filter(c => c.id !== cid));

  const setLine = (lineId, field, value) => setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lineId ? { ...l, [field]: value } : l) }));
  const selectItem = (lineId, label) => { const item = ITEMS.find(i => i.label === label); setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lineId ? { ...l, itemLabel: label, rate: String(item.rate), unitType: item.unitType } : l) })); };
  const saveInvoice = () => {
    const client = clients.find(c => c.id === invoiceForm.clientId && !c.archived);
    if (!client) return alert('Please select an active client.');
    const lines = invoiceForm.lines.map(l => ({ ...l, quantity: Number(l.quantity), rate: Number(l.rate), lineTotal: Number(l.quantity) * Number(l.rate) }));
    if (lines.some(l => !l.quantity || l.quantity <= 0 || Number.isNaN(l.rate))) return alert('Check quantity and rate values.');
    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    if (editingInvoice) {
      setInvoices(prev => prev.map(inv => inv.id === editingInvoice ? { ...inv, clientId: client.id, clientName: client.name, clientEmail: client.email, clientPhone: client.phone, clientAddress: client.address, ndisNumber: client.ndisNumber, clientPlanStartDate: client.planStartDate, clientPlanEndDate: client.planEndDate, clientBudget: Number(client.budget || 0), dueDate: invoiceForm.dueDate, notes: invoiceForm.notes, lines, total, updatedAt: new Date().toISOString() } : inv));
    } else {
      const stamp = todayISO().replace(/-/g, '');
      const next = invoices.filter(i => String(i.invoiceNumber).startsWith(`INV-${stamp}-`)).length + 1;
      setInvoices(prev => [{ id: makeId('invoice'), invoiceNumber: `INV-${stamp}-${String(next).padStart(3, '0')}`, clientId: client.id, clientName: client.name, clientEmail: client.email, clientPhone: client.phone, clientAddress: client.address, ndisNumber: client.ndisNumber, clientPlanStartDate: client.planStartDate, clientPlanEndDate: client.planEndDate, clientBudget: Number(client.budget || 0), issueDate: todayISO(), dueDate: invoiceForm.dueDate, lines, total, notes: invoiceForm.notes, status: 'Awaiting Payment', createdAt: new Date().toISOString() }, ...prev]);
    }
    setInvoiceForm(emptyInvoice()); setEditingInvoice(null); showNotice('Invoice saved.');
  };
  const editInvoice = (inv) => { setInvoiceForm({ clientId: inv.clientId, dueDate: inv.dueDate, notes: inv.notes || '', lines: inv.lines.map(l => ({ ...l, id: l.id || makeId('line'), quantity: String(l.quantity), rate: String(l.rate) })) }); setEditingInvoice(inv.id); setActive('Invoices'); window.scrollTo(0, 0); };
  const exportPDF = (inv) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const right = pageWidth - margin;
    let y = 18;

    const drawFooter = () => {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 18, right, pageHeight - 18);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${business.name || 'Business'} • ${business.email || ''} ${business.phone ? '• ' + business.phone : ''}`, margin, pageHeight - 12);
      doc.text(`Generated by LG Flow`, right, pageHeight - 12, { align: 'right' });
    };

    const ensureSpace = (needed = 16) => {
      if (y + needed > pageHeight - 24) {
        drawFooter();
        doc.addPage();
        y = 18;
      }
    };

    // Brand header
    if (business.logoUrl) {
      try {
        const imageType = String(business.logoUrl).includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(business.logoUrl, imageType, margin, y - 2, 28, 22, undefined, 'FAST');
      } catch (e) {
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(margin, y - 2, 28, 22, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.text((business.name || 'LG').slice(0, 2).toUpperCase(), margin + 14, y + 11, { align: 'center' });
      }
    } else {
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(margin, y - 2, 28, 22, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text((business.name || 'LG').slice(0, 2).toUpperCase(), margin + 14, y + 11, { align: 'center' });
    }

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(safeText(business.name || 'Business Name'), margin + 36, y + 4);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const businessLines = [business.abn, business.address, business.phone, business.email].filter(Boolean);
    businessLines.slice(0, 4).forEach((line, idx) => doc.text(safeText(line), margin + 36, y + 10 + idx * 5));

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text('TAX INVOICE', right, y + 4, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Invoice No: ${inv.invoiceNumber}`, right, y + 13, { align: 'right' });
    doc.text(`Issue Date: ${fmt(inv.issueDate)}`, right, y + 18, { align: 'right' });
    doc.text(`Due Date: ${fmt(inv.dueDate)}`, right, y + 23, { align: 'right' });
    doc.text(`Status: ${inv.status || 'Generated'}`, right, y + 28, { align: 'right' });
    y += 40;

    // Bill/payment boxes
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, 86, 42, 3, 3, 'FD');
    doc.roundedRect(margin + 94, y, 88, 42, 3, 3, 'FD');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text('BILLED TO', margin + 6, y + 8);
    doc.text('PAYMENT DETAILS', margin + 100, y + 8);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const clientLines = [inv.clientName, inv.ndisNumber ? `NDIS: ${inv.ndisNumber}` : '', inv.clientAddress, inv.clientPhone, inv.clientEmail].filter(Boolean);
    clientLines.slice(0, 5).forEach((line, idx) => doc.text(safeText(line), margin + 6, y + 15 + idx * 5));
    const payLines = (business.paymentDetails || 'Payment details not provided').split('\n').filter(Boolean);
    payLines.slice(0, 5).forEach((line, idx) => doc.text(safeText(line), margin + 100, y + 15 + idx * 5));
    y += 52;

    // Table header
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    const cols = { no: margin + 4, date: margin + 14, desc: margin + 42, qty: margin + 108, unit: margin + 125, rate: margin + 145, total: right - 4 };
    doc.text('#', cols.no, y + 6.5);
    doc.text('Date', cols.date, y + 6.5);
    doc.text('Description', cols.desc, y + 6.5);
    doc.text('Qty', cols.qty, y + 6.5);
    doc.text('Unit', cols.unit, y + 6.5);
    doc.text('Rate', cols.rate, y + 6.5);
    doc.text('Amount', cols.total, y + 6.5, { align: 'right' });
    y += 12;

    doc.setFont(undefined, 'normal');
    inv.lines.forEach((l, i) => {
      ensureSpace(14);
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 5, pageWidth - margin * 2, 10, 'F');
      }
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8.5);
      const desc = doc.splitTextToSize(safeText(l.itemLabel), 62);
      doc.text(String(i + 1), cols.no, y);
      doc.text(fmt(l.serviceDate), cols.date, y);
      doc.text(desc[0] || '', cols.desc, y);
      doc.text(String(l.quantity), cols.qty, y);
      doc.text(safeText(l.unitType), cols.unit, y);
      doc.text(money(l.rate), cols.rate, y);
      doc.text(money(l.lineTotal), cols.total, y, { align: 'right' });
      y += Math.max(10, desc.length * 4.5);
    });

    y += 4;
    ensureSpace(42);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, right, y);
    y += 8;
    const subtotal = Number(inv.total || 0);
    const totalBoxX = right - 70;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Subtotal', totalBoxX, y);
    doc.text(money(subtotal), right, y, { align: 'right' });
    y += 7;
    doc.text('GST', totalBoxX, y);
    doc.text('Included / N/A', right, y, { align: 'right' });
    y += 8;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(totalBoxX - 4, y - 6, 74, 13, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('TOTAL DUE', totalBoxX, y + 2);
    doc.text(money(inv.total), right - 4, y + 2, { align: 'right' });
    y += 18;

    if (inv.notes) {
      ensureSpace(24);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Notes', margin, y);
      y += 6;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.splitTextToSize(safeText(inv.notes), pageWidth - margin * 2).forEach(line => { ensureSpace(6); doc.text(line, margin, y); y += 5; });
    }

    drawFooter();
    doc.save(`${(business.name || 'LG-Flow').replace(/[^a-z0-9]+/gi, '-')}_${inv.clientName}_${inv.invoiceNumber}.pdf`);
  };

  const saveTxn = () => {
    const amount = Number(txnForm.amount);
    if (!txnForm.description.trim() || !amount || amount <= 0) return alert('Enter a description and amount greater than zero.');
    const client = clients.find(c => c.id === txnForm.clientId);
    const data = { ...txnForm, amount, clientName: client?.name || '' };
    if (editingTxn) setTransactions(prev => prev.map(t => t.id === editingTxn ? { ...t, ...data, updatedAt: new Date().toISOString() } : t));
    else setTransactions(prev => [{ id: makeId('txn'), ...data, createdAt: new Date().toISOString() }, ...prev]);
    setTxnForm(emptyTxn); setEditingTxn(null); showNotice('Transaction saved.');
  };
  const editTxn = (t) => { setTxnForm({ clientId: t.clientId || '', type: t.type || 'expense', status: t.status || 'paid', category: t.category || '', description: t.description || '', amount: String(t.amount || ''), date: t.date || todayISO() }); setEditingTxn(t.id); setActive('Transactions'); window.scrollTo(0, 0); };

  if (authLoading) return <LoadingScreen />;
  if (!user) return <AuthGate />;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'there';
  const userInitial = (displayName || user?.email || 'U').slice(0, 1).toUpperCase();

  const backup = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: payload }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lg-flow-backup.json'; a.click(); };
  const restore = async (file) => { try { const parsed = JSON.parse(await file.text()); const d = parsed.data || parsed; setBusiness({ ...EMPTY_BUSINESS, ...(d.business || {}) }); setClients(d.clients || []); setInvoices(d.invoices || []); setTransactions(d.transactions || []); showNotice('Backup restored.'); } catch { alert('Invalid backup JSON.'); } };

  const saveBusiness = (nextBusiness) => {
    if (!nextBusiness.name.trim()) return alert('Please enter your business name.');
    setBusiness({ ...EMPTY_BUSINESS, ...nextBusiness });
    showNotice('Business profile saved.');
  };

  if (!storageLoaded || !cloudChecked || cloudLoading) return <LoadingScreen message="Loading your business workspace…" />;

  const needsOnboarding = !business.name.trim();
  if (needsOnboarding) return <BusinessOnboarding business={business} onSave={saveBusiness} user={user} onLoadCloud={() => loadCloudData()} cloudLoading={cloudLoading} />;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="crown">♛</div><div><h1>LG FLOW</h1><p>{business.name || 'Premium NDIS'}<br/>Operations Suite</p></div></div>
      <nav>{TABS.map(t => <button key={t} className={active === t ? 'active' : ''} onClick={() => setActive(t)}><Icon name={t}/><span>{t}</span></button>)}</nav>
      <div className="status-card"><span className={isSupabaseConfigured ? 'dot on' : 'dot'} /> <b>{isSupabaseConfigured ? 'Supabase Connected' : 'Local Mode'}</b><small>{isSupabaseConfigured ? 'All systems operational' : 'Cloud sync disabled'}</small></div>
      <div className="profile-card"><div className="avatar">{(user.email || 'LG').slice(0,2).toUpperCase()}</div><div><b>{user.email}</b><small>Signed in securely</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><h2>Welcome back, {displayName} 👋</h2><p>Here’s what’s happening with your business today.</p></div><div className="top-actions"><label className="search">⌕<input placeholder="Search invoices..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘K</kbd></label><button className="icon-btn">◐</button><button className="ghost" onClick={async () => { await supabase.auth.signOut(); }}>Sign out</button><div className="user-badge">{userInitial}</div></div></header>
      {notice && <div className="notice">{notice}</div>}
      {active === 'Dashboard' && <Dashboard totals={totals} invoices={filteredInvoices.length ? filteredInvoices : invoices.slice(0, 5)} transactions={transactions} clients={clients} setActive={setActive}/>} 
      {active === 'Clients' && <Clients clients={clients} form={clientForm} setForm={setClientForm} editing={editingClient} save={saveClient} edit={editClient} archive={archiveClient} del={deleteClient} cancel={() => { setEditingClient(null); setClientForm(emptyClient); }}/>} 
      {active === 'Invoices' && <Invoices clients={clients.filter(c => !c.archived)} invoices={invoices} form={invoiceForm} setForm={setInvoiceForm} editing={editingInvoice} setLine={setLine} selectItem={selectItem} addLine={() => setInvoiceForm(p => ({ ...p, lines: [...p.lines, emptyLine()] }))} removeLine={lid => setInvoiceForm(p => p.lines.length === 1 ? p : ({ ...p, lines: p.lines.filter(l => l.id !== lid) }))} save={saveInvoice} edit={editInvoice} del={id => setInvoices(p => p.filter(i => i.id !== id))} exportPDF={exportPDF} cancel={() => { setEditingInvoice(null); setInvoiceForm(emptyInvoice()); }}/>} 
      {active === 'Transactions' && <Transactions clients={clients.filter(c => !c.archived)} transactions={transactions} form={txnForm} setForm={setTxnForm} editing={editingTxn} save={saveTxn} edit={editTxn} del={id => setTransactions(p => p.filter(t => t.id !== id))} cancel={() => { setEditingTxn(null); setTxnForm(emptyTxn); }}/>} 
      {active === 'Settings' && <Settings business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} clients={clients} invoices={invoices} transactions={transactions} backup={backup} restore={restore} clear={() => { if (confirm('Clear all data?')) { setBusiness(EMPTY_BUSINESS); setClients([]); setInvoices([]); setTransactions([]); localStorage.removeItem(storageKeyFor(user)); } }} user={user} sync={async () => showNotice((await syncSnapshot(payload, user)).message)} load={async () => loadCloudData()}/>} 
    </main>
  </div>;
}

function Icon({ name }) { return <span className="nav-icon">{({Dashboard:'⌂', Clients:'♙', Invoices:'▤', Transactions:'↔', Settings:'⚙'})[name]}</span>; }
function Card({ title, action, children, className = '' }) { return <section className={`card ${className}`}><div className="card-head"><h3>{title}</h3>{action}</div>{children}</section>; }
function Field({ label, multiline, ...props }) { return <label><span>{label}</span>{multiline ? <textarea {...props}/> : <input {...props}/>}</label>; }
function Records({ rows, empty, render }) { return rows.length ? rows.map(render) : <p className="empty">{empty}</p>; }
function Stat({ label, value, tone, icon, trend }) { return <div className={`stat ${tone || ''}`}><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><em>{trend}</em><Spark /></div>; }
function Spark() { return <svg viewBox="0 0 180 48" className="spark"><path d="M4 38 C22 40 24 31 38 30 C52 28 48 16 66 20 C82 25 82 34 100 29 C116 25 111 18 130 17 C150 16 151 29 176 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>; }

function Dashboard({ totals, invoices, transactions, clients, setActive }) {
  const activeClients = clients.filter(c => !c.archived);
  const clientSpend = (clientId) => invoices.filter(i => i.clientId === clientId).reduce((s, i) => s + Number(i.total || 0), 0);
  const topClients = [...activeClients].sort((a, b) => clientSpend(b.id) - clientSpend(a.id)).slice(0, 4);
  const expiringClients = activeClients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 60; }).sort((a, b) => daysUntil(a.planEndDate) - daysUntil(b.planEndDate)).slice(0, 4);
  return <>
    <div className="stat-grid"><Stat label="Total Revenue" value={money(totals.income)} tone="gold" icon="$" trend="Income received"/><Stat label="NDIS Budget" value={money(totals.totalBudget)} tone="blue" icon="◇" trend={`${money(totals.remainingBudget)} remaining`}/><Stat label="Active Clients" value={totals.activeClients} tone="green" icon="♙" trend={`${totals.expiringPlans} plans due in 30 days`}/><Stat label="Net Position" value={money(totals.net)} tone="violet" icon="▣" trend={`${money(totals.outstanding)} outstanding`}/></div>
    <div className="dashboard-grid"><Card title="Cashflow Overview" className="wide" action={<button className="ghost">Last 30 days⌄</button>}><div className="chart"><div className="axis"><span>$8K</span><span>$6K</span><span>$4K</span><span>$2K</span><span>$0</span></div><svg viewBox="0 0 660 260"><defs><linearGradient id="cashGold" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d7b46a" stopOpacity=".6"/><stop offset="1" stopColor="#d7b46a" stopOpacity="0"/></linearGradient><linearGradient id="cashBlue" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4f7cff" stopOpacity=".35"/><stop offset="1" stopColor="#4f7cff" stopOpacity="0"/></linearGradient></defs><path d="M0 220 C70 190 90 195 140 160 C210 110 250 130 310 88 C390 45 440 72 500 40 C570 25 610 50 660 10 L660 260 L0 260 Z" fill="url(#cashGold)"/><path d="M0 220 C70 190 90 195 140 160 C210 110 250 130 310 88 C390 45 440 72 500 40 C570 25 610 50 660 10" fill="none" stroke="#d7b46a" strokeWidth="5" strokeLinecap="round"/><path d="M0 218 C70 205 110 215 160 195 C240 170 290 185 350 150 C420 120 470 137 530 105 C590 90 630 96 660 75 L660 260 L0 260 Z" fill="url(#cashBlue)"/><path d="M0 218 C70 205 110 215 160 195 C240 170 290 185 350 150 C420 120 470 137 530 105 C590 90 630 96 660 75" fill="none" stroke="#4f7cff" strokeWidth="4" strokeLinecap="round"/></svg><div className="legend"><span className="gold-dot">Income {money(totals.income)}</span><span className="blue-dot">Expenses {money(totals.expenses)}</span></div></div></Card>
    <Card title="Recent Invoices" action={<button className="text-link" onClick={() => setActive('Invoices')}>View all</button>}><Records rows={invoices.slice(0,4)} empty="No invoices yet." render={i => <div className="invoice-row" key={i.id}><span className="accent-line"/><div><b>{i.invoiceNumber}</b><small>{i.clientName}</small></div><strong>{money(i.total)}</strong><em>{i.status || 'Generated'}</em><button>›</button></div>}/></Card></div>
    <div className="bottom-grid"><Card title="Upcoming Payments"><Records rows={invoices.slice(0,3)} empty="No upcoming payments." render={i => <div className="payment-row" key={i.id}><div className="date-tile"><span>{new Date(`${i.dueDate}T00:00:00`).toLocaleDateString(undefined,{month:'short'})}</span><b>{new Date(`${i.dueDate}T00:00:00`).getDate()}</b></div><div><b>{i.invoiceNumber}</b><small>{i.clientName}</small></div><strong>{money(i.total)}</strong></div>}/></Card><Card title="Top Clients by Revenue"><Records rows={topClients} empty="No clients yet." render={(c) => { const spent = clientSpend(c.id); const budget = Number(c.budget || 0); const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0; return <div className="client-rank" key={c.id}><div className="mini-avatar">{(c.name||'C').split(' ').map(x=>x[0]).join('').slice(0,2)}</div><b>{c.name}</b><div className="bar"><span style={{width:`${pct || 6}%`}}/></div><strong>{money(spent)}</strong><small>{budget ? `${pct}% of ${money(budget)}` : 'No budget set'}</small></div>; }}/></Card><Card title="Plan Watch"><Records rows={expiringClients} empty="No plans expiring soon." render={c => <div className="feed" key={c.id}><span>◷</span><div><b>{c.name}</b><small>{daysUntil(c.planEndDate)} days left · Ends {fmt(c.planEndDate)}</small></div><time>{money(Number(c.budget || 0))}</time></div>}/></Card><Card title="Activity Feed"><Records rows={[...invoices.slice(0,2), ...transactions.slice(0,2)]} empty="No activity yet." render={(x, i) => <div className="feed" key={x.id}><span>{i%2?'$':'▤'}</span><div><b>{x.invoiceNumber ? `Invoice ${x.invoiceNumber} created` : x.description}</b><small>{x.clientName || 'No Client'}</small></div><time>{i+1}h ago</time></div>}/></Card></div>
  </>;
}

function Clients({ clients, form, setForm, editing, save, edit, archive, del, cancel }) {
  const active = clients.filter(c => !c.archived), archived = clients.filter(c => c.archived);
  return <><Card title={editing ? 'Edit Client Profile' : 'Add NDIS Client'}><div className="grid"><Field label="Client Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/><Field label="NDIS Number" value={form.ndisNumber} onChange={e => setForm(p => ({ ...p, ndisNumber: e.target.value }))}/><Field label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/><Field label="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/><Field type="date" label="NDIS Plan Start" value={form.planStartDate} onChange={e => setForm(p => ({ ...p, planStartDate: e.target.value }))}/><Field type="date" label="NDIS Plan End" value={form.planEndDate} onChange={e => setForm(p => ({ ...p, planEndDate: e.target.value }))}/><Field type="number" step="0.01" label="NDIS Budget" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}/><Field label="Address" multiline value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}/></div><button className="primary" onClick={save}>{editing ? 'Update Client' : 'Save Client'}</button>{editing && <button onClick={cancel}>Cancel Edit</button>}</Card><Card title="Client Portfolio"><div className="client-grid"><Records rows={active} empty="No active clients added yet." render={c => <div className="client-card" key={c.id}><div className="client-top"><div className="big-avatar">{(c.name||'C').split(' ').map(x=>x[0]).join('').slice(0,2)}</div><span className="pill green">Active</span></div><h4>{c.name}</h4><p>NDIS: {c.ndisNumber || '-'}</p><p>Plan: {fmt(c.planStartDate)} → {fmt(c.planEndDate)}</p><p>Budget: {money(c.budget)} · {(() => { const d = daysUntil(c.planEndDate); return d === null ? 'No end date' : d < 0 ? 'Plan ended' : `${d} days left`; })()}</p><p>{c.email || '-'} · {c.phone || '-'}</p><small>{c.address || '-'}</small><div className="actions"><button onClick={() => edit(c)}>Edit</button><button onClick={() => archive(c.id)}>Archive</button><button className="danger" onClick={() => del(c.id)}>Delete</button></div></div>}/></div></Card><Card title="Archived Clients"><Records rows={archived} empty="No archived clients." render={c => <div className="record" key={c.id}><h4>{c.name}</h4><p>NDIS: {c.ndisNumber || '-'}</p><p>Plan: {fmt(c.planStartDate)} → {fmt(c.planEndDate)} · Budget: {money(c.budget)}</p><div className="actions"><button onClick={() => edit(c)}>Edit</button><button onClick={() => archive(c.id)}>Unarchive</button><button className="danger" onClick={() => del(c.id)}>Delete</button></div></div>}/></Card></>;
}

function Invoices({ clients, invoices, form, setForm, editing, setLine, selectItem, addLine, removeLine, save, edit, del, exportPDF, cancel }) {
  const preview = form.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0);
  return <><Card title={editing ? 'Edit Invoice' : 'Generate Invoice'}><div className="grid"><label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">Select active client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Field type="date" label="Due Date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}/></div>{form.lines.map((line, idx) => <div className="line" key={line.id}><div className="line-head"><h4>Service Line {idx + 1}</h4><button className="danger" onClick={() => removeLine(line.id)}>Remove</button></div><div className="grid"><label><span>Support Item</span><select value={line.itemLabel} onChange={e => selectItem(line.id, e.target.value)}>{ITEMS.map(i => <option key={i.label}>{i.label}</option>)}</select></label><Field type="date" label="Service Date" value={line.serviceDate} onChange={e => setLine(line.id, 'serviceDate', e.target.value)}/><Field label="Unit Type" value={line.unitType} onChange={e => setLine(line.id, 'unitType', e.target.value)}/><Field type="number" step="0.01" label="Quantity" value={line.quantity} onChange={e => setLine(line.id, 'quantity', e.target.value)}/><Field type="number" step="0.01" label="Rate" value={line.rate} onChange={e => setLine(line.id, 'rate', e.target.value)}/></div><b className="subtotal">Subtotal {money(Number(line.quantity || 0) * Number(line.rate || 0))}</b></div>)}<button onClick={addLine}>+ Add Another Service</button><Field label="Notes" multiline value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}/><div className="total">Invoice total: {money(preview)}</div><button className="primary" onClick={save}>{editing ? 'Update Invoice' : 'Generate Invoice'}</button>{editing && <button onClick={cancel}>Cancel Edit</button>}</Card><Card title="Invoice Register"><Records rows={invoices} empty="No invoices created yet." render={i => <details className="invoice-tile" key={i.id}><summary><div><b>{i.invoiceNumber}</b><small>{i.clientName}</small></div><strong>{money(i.total)}</strong><span className="pill">{i.status || 'Generated'}</span></summary><p>Issue: {fmt(i.issueDate)} · Due: {fmt(i.dueDate)} · NDIS: {i.ndisNumber || '-'}</p>{i.lines.map((l, idx) => <p key={l.id || idx}>{idx + 1}. {l.itemLabel} · {fmt(l.serviceDate)} · {l.quantity} {l.unitType} @ {money(l.rate)} = {money(l.lineTotal)}</p>)}{i.notes && <p>Notes: {i.notes}</p>}<div className="actions"><button onClick={() => edit(i)}>Edit</button><button onClick={() => exportPDF(i)}>Export PDF</button><button className="danger" onClick={() => del(i.id)}>Delete</button></div></details>}/></Card></>;
}

function Transactions({ clients, transactions, form, setForm, editing, save, edit, del, cancel }) {
  const [type, setType] = useState('all'), [status, setStatus] = useState('all');
  const rows = transactions.filter(t => (type === 'all' || t.type === type) && (status === 'all' || t.status === status));
  const income = rows.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount),0), expenses = rows.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount),0);
  return <><Card title={editing ? 'Edit Business Transaction' : 'Record Business Transaction'}><div className="grid"><label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">No Client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>Type</span><select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}><option>expense</option><option>income</option></select></label><label><span>Status</span><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}><option>pending</option><option>paid</option></select></label><Field label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}/><Field label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/><Field type="number" step="0.01" label="Amount" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}/><Field type="date" label="Date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}/></div><button className="primary" onClick={save}>{editing ? 'Update Transaction' : 'Save Transaction'}</button>{editing && <button onClick={cancel}>Cancel Edit</button>}</Card><Card title="Transaction Register"><div className="filters"><select value={type} onChange={e => setType(e.target.value)}><option>all</option><option>income</option><option>expense</option></select><select value={status} onChange={e => setStatus(e.target.value)}><option>all</option><option>pending</option><option>paid</option></select></div><div className="mini-stats"><b>Income {money(income)}</b><b>Expenses {money(expenses)}</b><b>Net {money(income-expenses)}</b></div><Records rows={rows} empty="No matching transactions found." render={t => <div className="txn-row" key={t.id}><div><b>{t.description}</b><small>{t.clientName || 'No Client'} · {t.category || 'General'} · {fmt(t.date)}</small></div><strong className={t.type === 'expense' ? 'negative' : 'positive'}>{t.type === 'expense' ? '-' : '+'}{money(t.amount)}</strong><span className="pill">{t.status}</span><div className="actions"><button onClick={() => edit(t)}>Edit</button><button className="danger" onClick={() => del(t.id)}>Delete</button></div></div>}/></Card></>;
}

function Settings({ business, setBusiness, saveBusiness, clients, invoices, transactions, backup, restore, clear, sync, load, user }) {
  const [draft, setDraft] = useState({ ...EMPTY_BUSINESS, ...business });

  useEffect(() => {
    setDraft({ ...EMPTY_BUSINESS, ...business });
  }, [business]);

  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  return <>
    <Card title="Business Profile">
      <p>This information is private to the signed-in workspace and appears on exported invoices.</p>
      <div className="logo-uploader">
        <div className="logo-preview">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'LG').slice(0,2).toUpperCase()}</span>}</div>
        <div>
          <b>Business Logo</b>
          <small>Upload a PNG or JPG. It will appear on exported invoices and is saved in your private profile.</small>
          <label className="file">Upload Logo<input type="file" accept="image/png,image/jpeg,image/jpg" onChange={async e => { const file = e.target.files?.[0]; if (file) updateDraft('logoUrl', await fileToDataUrl(file)); }}/></label>
          {draft.logoUrl && <button type="button" onClick={() => updateDraft('logoUrl', '')}>Remove Logo</button>}
        </div>
      </div>
      <div className="grid">
        <Field label="Business Name" value={draft.name} onChange={e => updateDraft('name', e.target.value)} />
        <Field label="ABN / Registration" value={draft.abn} onChange={e => updateDraft('abn', e.target.value)} />
        <Field label="Business Email" type="email" value={draft.email} onChange={e => updateDraft('email', e.target.value)} />
        <Field label="Business Phone" value={draft.phone} onChange={e => updateDraft('phone', e.target.value)} />
        <Field label="Business Address" multiline value={draft.address} onChange={e => updateDraft('address', e.target.value)} />
        <Field label="Payment Details" multiline value={draft.paymentDetails} onChange={e => updateDraft('paymentDetails', e.target.value)} placeholder={"Bank: Your Bank\nBSB: 000 000\nAccount: 0000 0000"} />
      </div>
      <button className="primary" onClick={() => saveBusiness(draft)}>Save Business Profile</button>
    </Card>
    <Card title="Backup, Restore & Cloud Sync"><p>Works offline with local storage. Supabase sync is tied to your signed-in account and includes your business profile.</p><button onClick={backup}>Export Backup JSON</button><label className="file">Import Backup JSON<input type="file" accept="application/json" onChange={e => e.target.files?.[0] && restore(e.target.files[0])}/></label><button className="primary" onClick={sync}>Sync to Supabase</button><button onClick={load}>Load from Supabase</button><button className="danger" onClick={clear}>Clear All Data</button></Card>
    <Card title="Data Summary"><div className="mini-stats"><b>Business: {business.name || 'Not set'}</b><b>Clients: {clients.length}</b><b>Invoices: {invoices.length}</b><b>Transactions: {transactions.length}</b></div></Card>
    <Card title="Cloud Status"><p><b>{isSupabaseConfigured ? 'Supabase Connected' : 'Local Mode'}</b></p><p>{isSupabaseConfigured ? `Signed in as ${user?.email || 'your account'}. Your cloud snapshot is private to this login.` : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages variables, public/supabase-config.js, or the app setup screen.'}</p><p><small>Config source: {supabaseConfigSource}</small></p><button onClick={async () => supabase && supabase.auth.signOut()}>Sign out</button></Card>
  </>;
}

function BusinessOnboarding({ business, onSave, user, onLoadCloud, cloudLoading }) {
  const [draft, setDraft] = useState({ ...EMPTY_BUSINESS, ...business });
  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  return <div className="auth-shell">
    <section className="auth-hero">
      <div className="crown">♛</div>
      <h1>Set up your business</h1>
      <p>Personalise LG Flow for your invoices, payment details and workspace branding.</p>
      <div className="auth-glass"><b>{user?.email || 'Your account'}</b><span>This profile is saved in your private cloud snapshot.</span></div>
      <button className="ghost" type="button" onClick={onLoadCloud} disabled={cloudLoading}>{cloudLoading ? 'Loading cloud…' : 'Load existing cloud profile'}</button>
    </section>
    <form className="auth-card" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
      <h2>Business onboarding</h2>
      <p>Enter the details you want shown on invoices. You can edit these later in Settings.</p>
      <div className="logo-uploader compact">
        <div className="logo-preview">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'LG').slice(0,2).toUpperCase()}</span>}</div>
        <div>
          <b>Business Logo</b>
          <small>Optional, but recommended for professional invoices.</small>
          <label className="file">Upload Logo<input type="file" accept="image/png,image/jpeg,image/jpg" onChange={async e => { const file = e.target.files?.[0]; if (file) updateDraft('logoUrl', await fileToDataUrl(file)); }}/></label>
        </div>
      </div>
      <Field label="Business Name" value={draft.name} onChange={e => updateDraft('name', e.target.value)} placeholder="Your business name" />
      <Field label="ABN / Registration" value={draft.abn} onChange={e => updateDraft('abn', e.target.value)} placeholder="ABN 000 000 000 00" />
      <Field label="Business Email" type="email" value={draft.email} onChange={e => updateDraft('email', e.target.value)} placeholder="hello@yourbusiness.com" />
      <Field label="Business Phone" value={draft.phone} onChange={e => updateDraft('phone', e.target.value)} placeholder="04xx xxx xxx" />
      <Field label="Business Address" multiline value={draft.address} onChange={e => updateDraft('address', e.target.value)} placeholder="Street, suburb, state" />
      <Field label="Payment Details" multiline value={draft.paymentDetails} onChange={e => updateDraft('paymentDetails', e.target.value)} placeholder={"Bank: Your Bank\nBSB: 000 000\nAccount: 0000 0000"} />
      <button className="primary">Complete Setup</button>
    </form>
  </div>;
}

function LoadingScreen({ message = 'Securing your workspace…' }) {
  return <div className="auth-shell"><div className="auth-card"><div className="crown">♛</div><h1>LG FLOW</h1><p>{message}</p></div></div>;
}

function AuthGate() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [setupAnonKey, setSetupAnonKey] = useState('');

  function saveSupabaseSetup(e) {
    e.preventDefault();
    if (!setupUrl || !setupAnonKey) {
      setMessage('Enter both Supabase URL and anon public key.');
      return;
    }
    window.localStorage.setItem('lg_flow_supabase_config', JSON.stringify({
      url: setupUrl.trim().replace(/\/rest\/v1\/?$/, ''),
      anonKey: setupAnonKey.trim(),
    }));
    window.location.reload();
  }

  if (!supabase) {
    return <div className="auth-shell">
      <section className="auth-hero"><div className="crown">♛</div><h1>LG FLOW</h1><p>Premium NDIS Operations Suite</p><div className="auth-glass"><b>Supabase setup required</b><span>Paste your new LG Flow project URL and anon public key once. The app will save it in this browser.</span></div></section>
      <form className="auth-card" onSubmit={saveSupabaseSetup}>
        <h2>Connect Supabase</h2>
        <p>You can also set these in Cloudflare Pages or public/supabase-config.js.</p>
        <Field label="Supabase Project URL" value={setupUrl} onChange={e => setSetupUrl(e.target.value)} placeholder="https://your-project.supabase.co" />
        <Field label="Anon public key" value={setupAnonKey} onChange={e => setSetupAnonKey(e.target.value)} placeholder="eyJ..." />
        {message && <div className="auth-message">{message}</div>}
        <button className="primary">Save & Reload</button>
      </form>
    </div>;
  }

  async function submit(e) {
    e.preventDefault();
    if (!supabase) { setMessage('Supabase is not configured.'); return; }
    if (!email || !password) { setMessage('Enter your email and password.'); return; }
    setBusy(true); setMessage('');
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName || 'LG Flow User' } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Account created. Check your email to confirm your sign up, then sign in.');
    else setMessage('Signed in. Loading workspace…');
  }

  return <div className="auth-shell">
    <section className="auth-hero"><div className="crown">♛</div><h1>LG FLOW</h1><p>Premium NDIS Operations Suite</p><div className="auth-glass"><b>Private cloud workspace</b><span>Clients, invoices, transactions and snapshots protected by Supabase Auth.</span></div></section>
    <form className="auth-card" onSubmit={submit}>
      <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
      <p>{mode === 'signup' ? 'Start a secure LG Flow workspace.' : 'Sign in to continue to your dashboard.'}</p>
      {mode === 'signup' && <Field label="Full name" value={fullName} onChange={e => setFullName(e.target.value)} />}
      <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      {message && <div className="auth-message">{message}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
      <button type="button" className="text-link auth-switch" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}>
        {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
      </button>
    </form>
  </div>;
}
