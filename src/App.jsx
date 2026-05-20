import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase, isSupabaseConfigured, supabaseConfigSource } from './supabaseClient';

const STORAGE_KEY = 'lg_flow_pwa_v2_premium';
const TABS = ['Dashboard', 'Participants', 'Invoices', 'Finance', 'Compliance', 'Reports', 'Schedules', 'Settings'];
const DEFAULT_PRICING_ITEMS = [
  { id: 'selfcare-weekday-daytime', group: 'Self Care Supports', itemNumber: '01_011_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', unitType: 'Hour', rate: 70.23, archived: false },
  { id: 'selfcare-weekday-evening', group: 'Self Care Supports', itemNumber: '01_015_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Weekday Evening', unitType: 'Hour', rate: 77.38, archived: false },
  { id: 'selfcare-weekday-night', group: 'Self Care Supports', itemNumber: '01_002_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Weekday Night', unitType: 'Hour', rate: 78.81, archived: false },
  { id: 'selfcare-saturday', group: 'Self Care Supports', itemNumber: '01_013_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Saturday', unitType: 'Hour', rate: 98.83, archived: false },
  { id: 'selfcare-sunday', group: 'Self Care Supports', itemNumber: '01_014_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Sunday', unitType: 'Hour', rate: 127.43, archived: false },
  { id: 'selfcare-public-holiday', group: 'Self Care Supports', itemNumber: '01_012_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Public Holiday', unitType: 'Hour', rate: 156.03, archived: false },
  { id: 'community-weekday-daytime', group: 'Community Access', itemNumber: '04_104_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Weekday Daytime', unitType: 'Hour', rate: 70.23, archived: false },
  { id: 'community-weekday-evening', group: 'Community Access', itemNumber: '04_103_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Weekday Evening', unitType: 'Hour', rate: 77.38, archived: false },
  { id: 'community-saturday', group: 'Community Access', itemNumber: '04_105_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Saturday', unitType: 'Hour', rate: 98.83, archived: false },
  { id: 'community-sunday', group: 'Community Access', itemNumber: '04_106_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Sunday', unitType: 'Hour', rate: 127.43, archived: false },
  { id: 'community-public-holiday', group: 'Community Access', itemNumber: '04_102_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Public Holiday', unitType: 'Hour', rate: 156.03, archived: false },
  { id: 'transport-activity-based', group: 'Transport', itemNumber: '04_590_0125_6_1', label: 'Activity Based Transport', unitType: 'Each', rate: 1.00, archived: false },
  { id: 'establishment-community', group: 'Establishment Fees', itemNumber: '04_049_0125_1_1', label: 'Establishment Fee for Personal Care/Participation', unitType: 'Each', rate: 702.30, archived: false },
  { id: 'establishment-selfcare', group: 'Establishment Fees', itemNumber: '01_049_0107_1_1', label: 'Establishment Fee for Personal Care/Participation', unitType: 'Each', rate: 702.30, archived: false },
];
const EMPTY_BUSINESS = {
  name: '',
  abn: '',
  email: '',
  phone: '',
  address: '',
  paymentDetails: '',
  logoUrl: '',
  pricingItems: DEFAULT_PRICING_ITEMS,
};
const getPricingItems = (business) => {
  const source = Array.isArray(business?.pricingItems) && business.pricingItems.length ? business.pricingItems : DEFAULT_PRICING_ITEMS;
  return source.map((item, idx) => ({
    id: item.id || item.itemNumber || `pricing_${idx}`,
    group: item.group || 'Custom Items',
    itemNumber: item.itemNumber || '',
    label: item.label || item.name || 'Untitled support item',
    unitType: item.unitType || item.unit || 'Hour',
    rate: Number(item.rate || 0),
    archived: Boolean(item.archived),
  }));
};
const getActivePricingItems = (business) => getPricingItems(business).filter(item => !item.archived);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const makeId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const getFirstName = (user) => {
  const source = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'there';
  const first = String(source).trim().split(/[\s._-]+/).filter(Boolean)[0] || 'there';
  return first === 'there' ? first : first.charAt(0).toUpperCase() + first.slice(1);
};
const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};
const buildWelcomeMessage = (user) => `${getTimeGreeting()}, ${getFirstName(user)}`;
const daysUntil = (dateStr) => { if (!dateStr) return null; const end = new Date(`${dateStr}T00:00:00`); if (Number.isNaN(end.getTime())) return null; return Math.ceil((end - new Date()) / 86400000); };
const fileToDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
const safeText = (value) => String(value ?? '');
const emptyClient = { name: '', ndisNumber: '', email: '', phone: '', address: '', planStartDate: '', planEndDate: '', budget: '' };
const emptyLine = () => { const item = DEFAULT_PRICING_ITEMS[0]; return { id: makeId('line'), itemCode: item.itemNumber, itemLabel: item.label, serviceDate: todayISO(), unitType: item.unitType, quantity: '1', rate: String(item.rate), notes: '' }; };
const emptyInvoice = () => ({ clientId: '', dueDate: addDaysISO(7), notes: '', lines: [emptyLine()] });
const emptyTxn = { clientId: '', type: 'expense', status: 'pending', category: '', description: '', amount: '', date: todayISO() };
const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Cancelled'];
const normaliseInvoiceStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'paid') return 'Paid';
  if (value === 'cancelled' || value === 'canceled') return 'Cancelled';
  if (value === 'draft') return 'Draft';
  return 'Pending';
};
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
  const [theme, setTheme] = useState(() => localStorage.getItem('lg_flow_theme') || 'light');
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lg_flow_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

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
    const outstanding = invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status))).reduce((s, i) => s + Number(i.total || 0), 0);
    const activeClients = clients.filter(c => !c.archived);
    const totalBudget = activeClients.reduce((s, c) => s + Number(c.budget || 0), 0);
    const invoicedTotal = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const remainingBudget = totalBudget - invoicedTotal;
    const expiringPlans = activeClients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; }).length;
    return { activeClients: activeClients.length, invoices: invoices.length, income, expenses, net: income - expenses, outstanding, totalBudget, invoicedTotal, remainingBudget, expiringPlans };
  }, [clients, invoices, transactions]);

  const filteredInvoices = invoices.filter(i => `${i.invoiceNumber} ${i.clientName}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const payload = { business, clients, invoices, transactions };
  const pricingItems = useMemo(() => getActivePricingItems(business), [business]);
  const showNotice = (message) => { setNotice(message); setTimeout(() => setNotice(''), 4200); };

  const saveClient = () => {
    if (!clientForm.name.trim()) return alert('Please enter the client name.');
    if (editingClient) setClients(prev => prev.map(c => c.id === editingClient ? { ...c, ...clientForm, updatedAt: new Date().toISOString() } : c));
    else setClients(prev => [{ id: makeId('client'), archived: false, createdAt: new Date().toISOString(), ...clientForm }, ...prev]);
    setClientForm(emptyClient); setEditingClient(null); showNotice('Client profile saved.');
  };
  const editClient = (c) => { setClientForm({ name: c.name || '', ndisNumber: c.ndisNumber || '', email: c.email || '', phone: c.phone || '', address: c.address || '', planStartDate: c.planStartDate || '', planEndDate: c.planEndDate || '', budget: String(c.budget ?? '') }); setEditingClient(c.id); setActive('Participants'); window.scrollTo(0, 0); };
  const archiveClient = (cid) => setClients(prev => prev.map(c => c.id === cid ? { ...c, archived: !c.archived } : c));
  const deleteClient = (cid) => invoices.some(i => i.clientId === cid) ? alert('This participant has invoices and cannot be deleted.') : setClients(prev => prev.filter(c => c.id !== cid));

  const setLine = (lineId, field, value) => setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lineId ? { ...l, [field]: value } : l) }));
  const selectItem = (lineId, value) => { const item = pricingItems.find(i => i.itemNumber === value || i.id === value || i.label === value) || pricingItems[0] || DEFAULT_PRICING_ITEMS[0]; setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lineId ? { ...l, itemCode: item.itemNumber, itemLabel: item.label, rate: String(item.rate), unitType: item.unitType } : l) })); };

  const syncInvoiceTransaction = (invoice, status = invoice?.status, note = '') => {
    if (!invoice?.id) return;
    const nextStatus = normaliseInvoiceStatus(status);
    setTransactions(prev => {
      const existing = prev.find(t => t.invoiceId === invoice.id);
      if (nextStatus === 'Cancelled' || nextStatus === 'Draft') {
        return existing ? prev.filter(t => t.invoiceId !== invoice.id) : prev;
      }
      const tx = {
        ...(existing || {}),
        id: existing?.id || makeId('txn'),
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId || '',
        clientName: invoice.clientName || '',
        type: 'income',
        status: nextStatus === 'Paid' ? 'paid' : 'pending',
        category: 'Invoice',
        description: `Invoice ${invoice.invoiceNumber} - ${invoice.clientName || 'Client'}`,
        amount: Number(invoice.total || 0),
        date: nextStatus === 'Paid' ? todayISO() : (invoice.issueDate || todayISO()),
        notes: note || existing?.notes || '',
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      return existing ? prev.map(t => t.invoiceId === invoice.id ? tx : t) : [tx, ...prev];
    });
  };

  const updateInvoiceStatus = (invoiceId, status, note = '') => {
    const current = invoices.find(inv => inv.id === invoiceId);
    if (!current) return;
    const nextStatus = normaliseInvoiceStatus(status);
    const updated = {
      ...current,
      status: nextStatus,
      statusNote: note,
      statusHistory: [
        ...(current.statusHistory || []),
        { status: nextStatus, note, at: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    };
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? updated : inv));
    syncInvoiceTransaction(updated, nextStatus, note);
    showNotice(`Invoice ${current.invoiceNumber} updated to ${nextStatus}.`);
  };

  const saveInvoice = () => {
    const client = clients.find(c => c.id === invoiceForm.clientId && !c.archived);
    if (!client) return alert('Please select an active client.');
    const lines = invoiceForm.lines.map(l => ({ ...l, itemCode: l.itemCode || '', itemLabel: l.itemLabel || '', unitType: l.unitType || 'Hour', quantity: Number(l.quantity), rate: Number(l.rate), notes: l.notes || '', lineTotal: Number(l.quantity) * Number(l.rate) }));
    if (lines.some(l => !l.quantity || l.quantity <= 0 || Number.isNaN(l.rate))) return alert('Check quantity and rate values.');
    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    const baseInvoice = {
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      clientPhone: client.phone,
      clientAddress: client.address,
      ndisNumber: client.ndisNumber,
      clientPlanStartDate: client.planStartDate,
      clientPlanEndDate: client.planEndDate,
      clientBudget: Number(client.budget || 0),
      dueDate: invoiceForm.dueDate,
      notes: invoiceForm.notes,
      lines,
      total,
      updatedAt: new Date().toISOString(),
    };
    let savedInvoice;
    if (editingInvoice) {
      const current = invoices.find(inv => inv.id === editingInvoice);
      savedInvoice = { ...current, ...baseInvoice, status: normaliseInvoiceStatus(current?.status), statusHistory: current?.statusHistory || [] };
      setInvoices(prev => prev.map(inv => inv.id === editingInvoice ? savedInvoice : inv));
      if (['Pending', 'Paid'].includes(normaliseInvoiceStatus(savedInvoice.status))) {
        syncInvoiceTransaction(savedInvoice, savedInvoice.status, savedInvoice.statusNote || '');
      }
    } else {
      const stamp = todayISO().replace(/-/g, '');
      const next = invoices.filter(i => String(i.invoiceNumber).startsWith(`INV-${stamp}-`)).length + 1;
      savedInvoice = {
        id: makeId('invoice'),
        invoiceNumber: `INV-${stamp}-${String(next).padStart(3, '0')}`,
        issueDate: todayISO(),
        status: 'Pending',
        statusHistory: [{ status: 'Pending', note: 'Invoice generated', at: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        ...baseInvoice,
      };
      setInvoices(prev => [savedInvoice, ...prev]);
      syncInvoiceTransaction(savedInvoice, 'Pending', 'Invoice generated');
    }
    setInvoiceForm(emptyInvoice()); setEditingInvoice(null); showNotice('Invoice saved.');
  };
  const editInvoice = (inv) => { setInvoiceForm({ clientId: inv.clientId, dueDate: inv.dueDate, notes: inv.notes || '', lines: inv.lines.map(l => ({ ...l, id: l.id || makeId('line'), itemCode: l.itemCode || '', notes: l.notes || '', quantity: String(l.quantity), rate: String(l.rate) })) }); setEditingInvoice(inv.id); setActive('Invoices'); window.scrollTo(0, 0); };
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
      doc.text(`Generated by Kajola Care`, right, pageHeight - 12, { align: 'right' });
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
        doc.text((business.name || 'KC').slice(0, 2).toUpperCase(), margin + 14, y + 11, { align: 'center' });
      }
    } else {
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(margin, y - 2, 28, 22, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text((business.name || 'KC').slice(0, 2).toUpperCase(), margin + 14, y + 11, { align: 'center' });
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
    doc.text('Item / Description', cols.desc, y + 6.5);
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
      const desc = doc.splitTextToSize(`${safeText(l.itemCode ? l.itemCode + ' - ' : '')}${safeText(l.itemLabel)}${l.notes ? ' — ' + safeText(l.notes) : ''}`, 62);
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
    doc.save(`${(business.name || 'Kajola-Care').replace(/[^a-z0-9]+/gi, '-')}_${inv.clientName}_${inv.invoiceNumber}.pdf`);
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
  const editTxn = (t) => { setTxnForm({ clientId: t.clientId || '', type: t.type || 'expense', status: t.status || 'paid', category: t.category || '', description: t.description || '', amount: String(t.amount || ''), date: t.date || todayISO() }); setEditingTxn(t.id); setActive('Finance'); window.scrollTo(0, 0); };

  if (authLoading) return <LoadingScreen />;
  if (!user) return <AuthGate />;

  const displayName = getFirstName(user);
  const welcomeMessage = buildWelcomeMessage(user);
  const userInitial = (displayName || user?.email || 'U').slice(0, 1).toUpperCase();

  const backup = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: payload }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kajola-care-backup.json'; a.click(); };
  const restore = async (file) => { try { const parsed = JSON.parse(await file.text()); const d = parsed.data || parsed; setBusiness({ ...EMPTY_BUSINESS, ...(d.business || {}) }); setClients(d.clients || []); setInvoices(d.invoices || []); setTransactions(d.transactions || []); showNotice('Backup restored.'); } catch { alert('Invalid backup JSON.'); } };

  const saveBusiness = (nextBusiness) => {
    if (!nextBusiness.name.trim()) return alert('Please enter your business name.');
    setBusiness({ ...EMPTY_BUSINESS, ...nextBusiness });
    showNotice('Business profile saved.');
  };

  if (!storageLoaded || !cloudChecked || cloudLoading) return <LoadingScreen message="Loading your business workspace…" />;

  const needsOnboarding = !business.name.trim();
  if (needsOnboarding) return <BusinessOnboarding business={business} onSave={saveBusiness} user={user} onLoadCloud={() => loadCloudData()} cloudLoading={cloudLoading} />;

  return <><div className="shell desktop-shell">
    <aside className="sidebar">
      <div className="brand"><BrandMark /><div><BrandWordmark /><p>Care • Connect • Empower</p></div></div>
      <nav>{TABS.map(t => <button key={t} className={active === t ? 'active' : ''} onClick={() => setActive(t)}><Icon name={t}/><span>{t}</span></button>)}</nav>
      <div className="status-card"><span className={isSupabaseConfigured ? 'dot on' : 'dot'} /> <b>{isSupabaseConfigured ? 'Supabase Connected' : 'Local Mode'}</b><small>{isSupabaseConfigured ? 'All systems operational' : 'Cloud sync disabled'}</small></div>
      <div className="profile-card"><div className="avatar">{(user.email || 'KC').slice(0,2).toUpperCase()}</div><div><b>{user.email}</b><small>Signed in securely</small></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><h2>{welcomeMessage}</h2><p>{business.name || 'Kajola Care Operations'}</p></div><div className="top-actions"><label className="search">⌕<input placeholder="Search invoices..." value={query} onFocus={() => setActive('Invoices')} onKeyDown={e => { if (e.key === 'Enter') setActive('Invoices'); }} onChange={e => { setQuery(e.target.value); if (active !== 'Invoices') setActive('Invoices'); }}/><kbd>⌘K</kbd></label><button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '◐'}</button><button className="ghost" onClick={async () => { await supabase.auth.signOut(); }}>Sign out</button><div className="user-badge">{userInitial}</div></div></header>
      {notice && <div className="notice">{notice}</div>}
      {active === 'Dashboard' && <Dashboard totals={totals} invoices={filteredInvoices.length ? filteredInvoices : invoices.slice(0, 5)} transactions={transactions} clients={clients} setActive={setActive}/>} 
      {active === 'Participants' && <Clients clients={clients} form={clientForm} setForm={setClientForm} editing={editingClient} save={saveClient} edit={editClient} archive={archiveClient} del={deleteClient} cancel={() => { setEditingClient(null); setClientForm(emptyClient); }}/>} 
      {active === 'Invoices' && <Invoices pricingItems={pricingItems} clients={clients.filter(c => !c.archived)} invoices={invoices} form={invoiceForm} setForm={setInvoiceForm} editing={editingInvoice} setLine={setLine} selectItem={selectItem} addLine={() => setInvoiceForm(p => ({ ...p, lines: [...p.lines, emptyLine()] }))} removeLine={lid => setInvoiceForm(p => p.lines.length === 1 ? p : ({ ...p, lines: p.lines.filter(l => l.id !== lid) }))} save={saveInvoice} edit={editInvoice} del={id => { setInvoices(p => p.filter(i => i.id !== id)); setTransactions(p => p.filter(t => t.invoiceId !== id)); }} exportPDF={exportPDF} onStatusChange={updateInvoiceStatus} query={query} setQuery={setQuery} cancel={() => { setEditingInvoice(null); setInvoiceForm(emptyInvoice()); }}/>} 
      {active === 'Finance' && <FinanceWorkspace clients={clients.filter(c => !c.archived)} transactions={transactions} invoices={invoices} form={txnForm} setForm={setTxnForm} editing={editingTxn} save={saveTxn} edit={editTxn} del={id => setTransactions(p => p.filter(t => t.id !== id))} cancel={() => { setEditingTxn(null); setTxnForm(emptyTxn); }}/>} 
      {active === 'Compliance' && <ComplianceWorkspace clients={clients} invoices={invoices} totals={totals} />}
      {active === 'Reports' && <FutureWorkspace title="Reports" description="Operational and financial reporting is planned for the next Kajola Care release." />}
      {active === 'Schedules' && <FutureWorkspace title="Schedules" description="Roster and appointment scheduling is planned for a future release." />}
      {active === 'Settings' && <Settings pricingItems={pricingItems} business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} clients={clients} invoices={invoices} transactions={transactions} backup={backup} restore={restore} clear={() => { if (confirm('Clear all data?')) { setBusiness(EMPTY_BUSINESS); setClients([]); setInvoices([]); setTransactions([]); localStorage.removeItem(storageKeyFor(user)); } }} user={user} sync={async () => showNotice((await syncSnapshot(payload, user)).message)} load={async () => loadCloudData()}/>} 
    </main>
  </div>
  <MobileShell
    active={active}
    setActive={setActive}
    displayName={displayName}
    welcomeMessage={welcomeMessage}
    business={business}
    pricingItems={pricingItems}
    totals={totals}
    clients={clients}
    invoices={invoices}
    transactions={transactions}
    notice={notice}
    query={query}
    setQuery={setQuery}
    user={user}
    theme={theme}
    toggleTheme={toggleTheme}
    clientForm={clientForm}
    setClientForm={setClientForm}
    editingClient={editingClient}
    saveClient={saveClient}
    editClient={editClient}
    archiveClient={archiveClient}
    deleteClient={deleteClient}
    cancelClient={() => { setEditingClient(null); setClientForm(emptyClient); }}
    invoiceForm={invoiceForm}
    setInvoiceForm={setInvoiceForm}
    editingInvoice={editingInvoice}
    setLine={setLine}
    selectItem={selectItem}
    addLine={() => setInvoiceForm(p => ({ ...p, lines: [...p.lines, emptyLine()] }))}
    removeLine={lid => setInvoiceForm(p => p.lines.length === 1 ? p : ({ ...p, lines: p.lines.filter(l => l.id !== lid) }))}
    saveInvoice={saveInvoice}
    editInvoice={editInvoice}
    deleteInvoice={id => { setInvoices(p => p.filter(i => i.id !== id)); setTransactions(p => p.filter(t => t.invoiceId !== id)); }}
    exportPDF={exportPDF}
    updateInvoiceStatus={updateInvoiceStatus}
    cancelInvoice={() => { setEditingInvoice(null); setInvoiceForm(emptyInvoice()); }}
    txnForm={txnForm}
    setTxnForm={setTxnForm}
    editingTxn={editingTxn}
    saveTxn={saveTxn}
    editTxn={editTxn}
    deleteTxn={id => setTransactions(p => p.filter(t => t.id !== id))}
    cancelTxn={() => { setEditingTxn(null); setTxnForm(emptyTxn); }}
    settings={<Settings pricingItems={pricingItems} business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} clients={clients} invoices={invoices} transactions={transactions} backup={backup} restore={restore} clear={() => { if (confirm('Clear all data?')) { setBusiness(EMPTY_BUSINESS); setClients([]); setInvoices([]); setTransactions([]); localStorage.removeItem(storageKeyFor(user)); } }} user={user} sync={async () => showNotice((await syncSnapshot(payload, user)).message)} load={async () => loadCloudData()}/>}
  />
</>;
}

function BrandWordmark({ compact = false, hero = false }) {
  return <div className={`kajola-wordmark ${compact ? 'compact' : ''} ${hero ? 'hero' : ''}`} aria-label="Kajola Care"><span className="kajola-name">Kajola</span><span className="kajola-care">Care</span></div>;
}

function BrandMark({ compact = false }) {
  return <div className={`kajola-mark ${compact ? 'compact' : ''}`}><img src="/icons/kajola-care-logo.png" alt="Kajola Care" /></div>;
}

function MobileShell({ active, setActive, displayName, welcomeMessage, business, pricingItems, totals, clients, invoices, transactions, notice, query, setQuery, user, theme, toggleTheme, clientForm, setClientForm, editingClient, saveClient, editClient, archiveClient, deleteClient, cancelClient, invoiceForm, setInvoiceForm, editingInvoice, setLine, selectItem, addLine, removeLine, saveInvoice, editInvoice, deleteInvoice, exportPDF, updateInvoiceStatus, cancelInvoice, txnForm, setTxnForm, editingTxn, saveTxn, editTxn, deleteTxn, cancelTxn, settings }) {
  const [fabOpen, setFabOpen] = useState(false);
    const activeClients = clients.filter(c => !c.archived);
  const alerts = getMobileAlerts({ clients, invoices, totals });
  const recentInvoices = invoices.slice(0, 4);
  const openAction = (tab) => { setFabOpen(false); setActive(tab); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 20); };
  return <div className="mobile-shell">
    <header className="mobile-top">
      <div className="mobile-brand"><BrandMark compact /><div><BrandWordmark compact /><small>{business.name || 'Care • Connect • Empower'}</small></div></div>
      <div className="mobile-top-actions"><button className="mobile-theme" aria-label="Toggle theme" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '◐'}</button><button className="mobile-signout" onClick={async () => { await supabase.auth.signOut(); }}>Sign out</button></div>
    </header>
    <main className="mobile-main">
      {notice && <div className="notice mobile-notice">{notice}</div>}
      {active === 'Dashboard' && <MobileHome welcomeMessage={welcomeMessage} totals={totals} alerts={alerts} invoices={recentInvoices} clients={activeClients} setActive={setActive} />}
      {active === 'Participants' && <MobileParticipants clients={clients} form={clientForm} setForm={setClientForm} editing={editingClient} save={saveClient} edit={editClient} archive={archiveClient} del={deleteClient} cancel={cancelClient} />}
      {active === 'Invoices' && <MobileInvoices pricingItems={pricingItems} clients={activeClients} invoices={invoices} form={invoiceForm} setForm={setInvoiceForm} editing={editingInvoice} setLine={setLine} selectItem={selectItem} addLine={addLine} removeLine={removeLine} save={saveInvoice} edit={editInvoice} del={deleteInvoice} exportPDF={exportPDF} onStatusChange={updateInvoiceStatus} cancel={cancelInvoice} query={query} setQuery={setQuery} />}
      {active === 'Finance' && <MobileFinance clients={activeClients} transactions={transactions} form={txnForm} setForm={setTxnForm} editing={editingTxn} save={saveTxn} edit={editTxn} del={deleteTxn} cancel={cancelTxn} />}
      {active === 'Compliance' && <ComplianceWorkspace clients={clients} invoices={invoices} totals={totals} />}
      {active === 'Reports' && <FutureWorkspace title="Reports" description="Operational and financial reporting is planned for the next Kajola Care release." />}
      {active === 'Schedules' && <FutureWorkspace title="Schedules" description="Roster and appointment scheduling is planned for a future release." />}
      {active === 'Settings' && <div className="mobile-settings"><MobileMore setActive={setActive} />{settings}</div>}
    </main>
    <button className="mobile-fab" onClick={() => setFabOpen(v => !v)}>+</button>
    {fabOpen && <div className="fab-sheet" onClick={() => setFabOpen(false)}><div onClick={e => e.stopPropagation()}>
      <b>Quick action</b>
      <button onClick={() => openAction('Participants')}>New participant</button>
      <button onClick={() => openAction('Invoices')}>New invoice</button>
      <button onClick={() => openAction('Finance')}>New expense</button>
      <button onClick={() => setFabOpen(false)}>Close</button>
    </div></div>}
    <nav className="mobile-bottom">
      {[['Dashboard','Dashboard','⌂'],['Participants','Participants','♙'],['Finance','Finance','↔'],['Settings','More','☰']].map(([tab,label,icon]) => <button key={tab} className={(active === tab || (tab === 'Settings' && ['Invoices','Compliance','Reports','Schedules','Settings'].includes(active))) ? 'active' : ''} onClick={() => setActive(tab)}><span>{icon}</span><small>{label}</small></button>)}
    </nav>
  </div>;
}

function getMobileAlerts({ clients, invoices, totals }) {
  const alerts = [];
  clients.filter(c => !c.archived).forEach(c => {
    const d = daysUntil(c.planEndDate);
    if (d !== null && d >= 0 && d <= 30) alerts.push({ type: 'Plan', title: `${c.name} plan ends in ${d} day${d === 1 ? '' : 's'}`, meta: fmt(c.planEndDate) });
  });
  invoices.filter(i => i.status !== 'Paid').forEach(i => {
    const d = daysUntil(i.dueDate);
    if (d !== null && d < 0) alerts.push({ type: 'Overdue', title: `${i.invoiceNumber} is overdue`, meta: `${i.clientName} · ${money(i.total)}` });
  });
  if (totals.totalBudget > 0) {
    const used = Math.min(999, Math.round((totals.invoicedTotal / totals.totalBudget) * 100));
    if (used >= 80) alerts.push({ type: 'Budget', title: `Budget usage is ${used}%`, meta: `${money(totals.remainingBudget)} remaining` });
  }
  return alerts.slice(0, 5);
}

function MobileMore({ setActive }) {
  return <MobilePanel title="More"><div className="mobile-more-grid"><button onClick={() => setActive('Invoices')}>Invoices</button><button onClick={() => setActive('Compliance')}>Compliance</button><button onClick={() => setActive('Reports')}>Reports</button><button onClick={() => setActive('Schedules')}>Schedules</button><button onClick={() => setActive('Settings')}>Settings</button></div></MobilePanel>;
}

function MobileHome({ welcomeMessage, totals, alerts, invoices, clients, setActive }) {
  return <section className="mobile-home">
    <div className="mobile-hero"><h2>{welcomeMessage}</h2><p>Here’s what’s happening with your business today.</p></div>
    <div className="mobile-kpis">
      <MiniKpi label="Revenue" value={money(totals.income)} />
      <MiniKpi label="Expenses" value={money(totals.expenses)} />
      <MiniKpi label="Participants" value={totals.activeClients} />
      <MiniKpi label="Net" value={money(totals.net)} />
    </div>
    <div className="mobile-quick"><button onClick={() => setActive('Invoices')}>+ Invoice</button><button onClick={() => setActive('Finance')}>+ Expense</button></div>
    <MobilePanel title="Today" action={alerts.length ? `${alerts.length} alerts` : 'All clear'}>{alerts.length ? alerts.map((a,i) => <div className="mobile-alert" key={i}><span>{a.type}</span><div><b>{a.title}</b><small>{a.meta}</small></div></div>) : <p className="mobile-empty">No urgent NDIS alerts today.</p>}</MobilePanel>
    <MobilePanel title="Recent invoices" action="View all"><Records rows={invoices} empty="No invoices yet." render={i => <div className="mobile-list-row" key={i.id}><div><b>{i.invoiceNumber}</b><small>{i.clientName} · {fmt(i.dueDate)}</small></div><strong>{money(i.total)}</strong></div>} /></MobilePanel>
    <MobilePanel title="Active clients" action="View all"><Records rows={clients.slice(0,3)} empty="No participants yet." render={c => <div className="mobile-list-row" key={c.id}><div><b>{c.name}</b><small>Plan ends {fmt(c.planEndDate)}</small></div><strong>{money(c.budget)}</strong></div>} /></MobilePanel>
  </section>;
}

function MiniKpi({ label, value }) { return <div className="mini-kpi"><small>{label}</small><b>{value}</b></div>; }
function MobilePanel({ title, action, children }) { return <section className="mobile-panel"><div className="mobile-panel-head"><h3>{title}</h3><small>{action}</small></div>{children}</section>; }

function MobileParticipants({ clients, form, setForm, editing, save, edit, archive, del, cancel }) {
  const [showForm, setShowForm] = useState(false);
  const active = clients.filter(c => !c.archived);
  return <section className="mobile-page">
    <div className="mobile-title"><h2>Participants</h2><button onClick={() => setShowForm(v => !v)}>{showForm || editing ? 'Hide form' : '+ Participant'}</button></div>
    {(showForm || editing) && <MobilePanel title={editing ? 'Edit client' : 'New client'}><Field label="Participant Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/><Field label="NDIS Number" value={form.ndisNumber} onChange={e => setForm(p => ({ ...p, ndisNumber: e.target.value }))}/><div className="mobile-two"><Field type="date" label="Plan Start" value={form.planStartDate} onChange={e => setForm(p => ({ ...p, planStartDate: e.target.value }))}/><Field type="date" label="Plan End" value={form.planEndDate} onChange={e => setForm(p => ({ ...p, planEndDate: e.target.value }))}/></div><Field type="number" label="Budget" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}/><Field label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/><Field label="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/><Field label="Address" multiline value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}/><button className="primary" onClick={() => { save(); setShowForm(false); }}>{editing ? 'Update client' : 'Save client'}</button>{editing && <button onClick={cancel}>Cancel</button>}</MobilePanel>}
    <MobilePanel title="Active clients" action={`${active.length} clients`}>
      <div className="compact-client-list"><Records rows={active} empty="No active participants added yet." render={c => <div className="compact-client-row" key={c.id}><div><b>{c.name}</b><small>NDIS {c.ndisNumber || '-'} · Plan {fmt(c.planEndDate)}</small></div><div><strong>{money(c.budget)}</strong><small>{(() => { const d = daysUntil(c.planEndDate); return d === null ? 'No end date' : d < 0 ? 'Ended' : `${d} days left`; })()}</small></div><div className="compact-actions"><button onClick={() => { edit(c); setShowForm(true); }}>Edit</button><button onClick={() => archive(c.id)}>Archive</button><button className="danger" onClick={() => del(c.id)}>Delete</button></div></div>} /></div>
    </MobilePanel>
  </section>;
}

function MobileInvoices({ pricingItems = DEFAULT_PRICING_ITEMS, clients, invoices, form, setForm, editing, setLine, selectItem, addLine, removeLine, save, edit, del, exportPDF, onStatusChange, cancel, query, setQuery }) {
  const [step, setStep] = useState(1);
  const line = form.lines[0] || emptyLine();
  const preview = form.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0);
  const filtered = invoices.filter(i => `${i.invoiceNumber} ${i.clientName}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="mobile-page">
    <div className="mobile-title"><h2>Invoice</h2><span>Step {step}/4</span></div>
    <MobilePanel title={editing ? 'Edit invoice' : 'New invoice'} action="Client → Service → Review">
      <div className="step-dots">{[1,2,3,4].map(n => <button key={n} className={step === n ? 'active' : ''} onClick={() => setStep(n)}>{n}</button>)}</div>
      {step === 1 && <><label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">Select active client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Field type="date" label="Due Date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}/></>}
      {step === 2 && <><label><span>Support Item</span><select value={line.itemCode || line.itemLabel} onChange={e => selectItem(line.id, e.target.value)}>{pricingItems.map(i => <option key={i.id || i.itemNumber} value={i.itemNumber || i.id}>{i.itemNumber ? `${i.itemNumber} — ${i.label}` : i.label}</option>)}</select></label><Field type="date" label="Service Date" value={line.serviceDate} onChange={e => setLine(line.id, 'serviceDate', e.target.value)}/><div className="mobile-two"><Field type="number" step="0.01" label="Qty" value={line.quantity} onChange={e => setLine(line.id, 'quantity', e.target.value)}/><Field type="number" step="0.01" label="Rate" value={line.rate} onChange={e => setLine(line.id, 'rate', e.target.value)}/></div><Field label="Line Notes" value={line.notes || ''} onChange={e => setLine(line.id, 'notes', e.target.value)} placeholder="Optional notes" /><button onClick={addLine}>+ Add another line</button>{form.lines.length > 1 && <small>{form.lines.length} service lines attached</small>}</>}
      {step === 3 && <><Field label="Notes" multiline value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}/>{form.lines.map((l, idx) => <div className="mobile-list-row" key={l.id}><div><b>{idx + 1}. {l.itemLabel}</b><small>{l.quantity} {l.unitType} @ {money(l.rate)}</small></div><strong>{money(Number(l.quantity || 0) * Number(l.rate || 0))}</strong></div>)}</>}
      {step === 4 && <div className="review-box"><small>Invoice total</small><b>{money(preview)}</b><p>Check the client, service dates, rates, and notes before generating.</p></div>}
      <div className="mobile-wizard-actions"><button disabled={step === 1} onClick={() => setStep(s => Math.max(1, s - 1))}>Back</button>{step < 4 ? <button className="primary" onClick={() => setStep(s => Math.min(4, s + 1))}>Next</button> : <button className="primary" onClick={() => { save(); setStep(1); }}>{editing ? 'Update invoice' : 'Generate invoice'}</button>}</div>{editing && <button onClick={cancel}>Cancel edit</button>}
    </MobilePanel>
    <MobilePanel title="Invoice register"><label className="mobile-search"><input placeholder="Search invoices..." value={query} onChange={e => setQuery(e.target.value)}/></label><Records rows={filtered} empty="No invoices created yet." render={i => <div className="mobile-invoice-card" key={i.id}><div><b>{i.invoiceNumber}</b><span>{money(i.total)}</span></div><small>{i.clientName} · Due {fmt(i.dueDate)}</small><InvoiceStatusControls invoice={i} onChange={onStatusChange} compact /><div className="mobile-card-actions"><button onClick={() => edit(i)}>Edit</button><button onClick={() => exportPDF(i)}>PDF</button><button className="danger" onClick={() => del(i.id)}>Delete</button></div></div>} /></MobilePanel>
  </section>;
}


function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function filterAndSortTransactions(transactions, filters) {
  return [...transactions]
    .filter(t => (filters.type === 'all' || t.type === filters.type))
    .filter(t => (filters.status === 'all' || (t.status || 'paid') === filters.status))
    .filter(t => (filters.clientId === 'all' || (filters.clientId === 'none' ? !t.clientId : t.clientId === filters.clientId)))
    .filter(t => {
      const q = String(filters.query || '').trim().toLowerCase();
      if (!q) return true;
      return `${t.description || ''} ${t.clientName || ''} ${t.category || ''}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (filters.sort === 'date_asc') return dateValue(a.date) - dateValue(b.date);
      if (filters.sort === 'amount_desc') return Number(b.amount || 0) - Number(a.amount || 0);
      if (filters.sort === 'amount_asc') return Number(a.amount || 0) - Number(b.amount || 0);
      return dateValue(b.date) - dateValue(a.date);
    });
}

function MobileFinance({ clients, transactions, form, setForm, editing, save, edit, del, cancel }) {
  const [filters, setFilters] = useState({ type: 'all', status: 'all', clientId: 'all', sort: 'date_desc', query: '' });
  const [page, setPage] = useState(1);
  const rows = filterAndSortTransactions(transactions, filters);
  const { totalPages, safePage, start, pageRows } = paginateRows(rows, page);
  useEffect(() => { setPage(1); }, [filters.type, filters.status, filters.clientId, filters.sort, filters.query, transactions.length]);
  const income = rows.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses = rows.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  return <section className="mobile-page">
    <div className="mobile-title"><h2>Finance</h2><span>{money(income-expenses)} net</span></div>
    <div className="mobile-kpis two"><MiniKpi label="Income" value={money(income)} /><MiniKpi label="Expenses" value={money(expenses)} /></div>
    <MobilePanel title={editing ? 'Edit transaction' : 'New transaction'}>
      <label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">No Participant</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="mobile-two"><label><span>Type</span><select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}><option>expense</option><option>income</option></select></label><label><span>Status</span><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}><option>pending</option><option>paid</option></select></label></div>
      <Field label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/><Field label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}/><div className="mobile-two"><Field type="number" step="0.01" label="Amount" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}/><Field type="date" label="Date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}/></div><button className="primary" onClick={save}>{editing ? 'Update transaction' : 'Save transaction'}</button>{editing && <button onClick={cancel}>Cancel</button>}
    </MobilePanel>
    <MobilePanel title="Transaction filters" action={`${rows.length} shown`}>
      <Field label="Search" value={filters.query} placeholder="Description, client, category" onChange={e => setFilter('query', e.target.value)} />
      <div className="mobile-two">
        <label><span>Type</span><select value={filters.type} onChange={e => setFilter('type', e.target.value)}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label><span>Status</span><select value={filters.status} onChange={e => setFilter('status', e.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="paid">Paid</option></select></label>
      </div>
      <div className="mobile-two">
        <label><span>Client</span><select value={filters.clientId} onChange={e => setFilter('clientId', e.target.value)}><option value="all">All participants</option><option value="none">No participant</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span>Sort</span><select value={filters.sort} onChange={e => setFilter('sort', e.target.value)}><option value="date_desc">Newest date</option><option value="date_asc">Oldest date</option><option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option></select></label>
      </div>
    </MobilePanel>
    <MobilePanel title="Transactions" action={`${rows.length ? start + 1 : 0}-${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}`}><Records rows={pageRows} empty="No matching transactions found." render={t => <div className="mobile-list-row" key={t.id}><div><b>{t.description}</b><small>{t.clientName || 'No participant'} · {t.category || 'General'} · {fmt(t.date)} · {(t.status || 'paid')}</small></div><strong className={t.type === 'expense' ? 'negative' : 'positive'}>{t.type === 'expense' ? '-' : '+'}{money(t.amount)}</strong><div className="actions"><button onClick={() => edit(t)}>Edit</button><button className="danger" onClick={() => del(t.id)}>Delete</button></div></div>} />{rows.length > PAGE_SIZE && <Pagination page={safePage} totalPages={totalPages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} />}</MobilePanel>
  </section>;
}

function Icon({ name }) { return <span className="nav-icon">{({Dashboard:'⌂', Participants:'♙', Invoices:'▤', Finance:'↔', Compliance:'✓', Reports:'▥', Schedules:'◷', Settings:'⚙'})[name] || '•'}</span>; }
function Card({ title, action, children, className = '' }) { return <section className={`card ${className}`}><div className="card-head"><h3>{title}</h3>{action}</div>{children}</section>; }
function Field({ label, multiline, ...props }) { return <label><span>{label}</span>{multiline ? <textarea {...props}/> : <input {...props}/>}</label>; }
function Records({ rows, empty, render }) { return rows.length ? rows.map(render) : <p className="empty">{empty}</p>; }
function Stat({ label, value, tone, icon, trend }) { return <div className={`stat ${tone || ''}`}><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><em>{trend}</em></div>; }
function Spark() { return <svg viewBox="0 0 180 48" className="spark"><path d="M4 38 C22 40 24 31 38 30 C52 28 48 16 66 20 C82 25 82 34 100 29 C116 25 111 18 130 17 C150 16 151 29 176 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>; }


function CashflowOverview({ transactions }) {
  const [period, setPeriod] = useState('30');
  const days = Number(period);
  const now = new Date();
  const buckets = Array.from({ length: Math.min(days, 90) }, (_, index) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (Math.min(days, 90) - 1 - index) * Math.ceil(days / Math.min(days, 90)));
    return { date: d, income: 0, expenses: 0 };
  });
  const bucketFor = (date) => {
    if (!buckets.length) return -1;
    const diff = Math.floor((date - buckets[0].date) / 86400000);
    return Math.max(0, Math.min(buckets.length - 1, Math.floor(diff / Math.ceil(days / buckets.length))));
  };
  transactions.forEach(t => {
    const d = new Date(`${t.date || t.createdAt || todayISO()}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const age = (now - d) / 86400000;
    if (age < 0 || age > days) return;
    const idx = bucketFor(d);
    if (idx < 0) return;
    if (t.type === 'income') buckets[idx].income += Number(t.amount || 0);
    if (t.type === 'expense') buckets[idx].expenses += Number(t.amount || 0);
  });
  const max = Math.max(1, ...buckets.map(b => Math.max(b.income, b.expenses)));
  const points = (key) => buckets.map((b, i) => {
    const x = buckets.length === 1 ? 0 : (i / (buckets.length - 1)) * 660;
    const y = 230 - (Number(b[key] || 0) / max) * 210;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const totalIncome = buckets.reduce((s,b)=>s+b.income,0);
  const totalExpenses = buckets.reduce((s,b)=>s+b.expenses,0);
  return <Card title="Cashflow Overview" className="wide" action={<select className="period-select" value={period} onChange={e => setPeriod(e.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>}>
    <div className="chart"><div className="axis"><span>{money(max)}</span><span>{money(max * .75)}</span><span>{money(max * .5)}</span><span>{money(max * .25)}</span><span>$0</span></div><svg viewBox="0 0 660 260"><defs><linearGradient id="cashGold" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d7b46a" stopOpacity=".55"/><stop offset="1" stopColor="#d7b46a" stopOpacity="0"/></linearGradient><linearGradient id="cashBlue" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4f7cff" stopOpacity=".32"/><stop offset="1" stopColor="#4f7cff" stopOpacity="0"/></linearGradient></defs><polyline points={points('income')} fill="none" stroke="#d7b46a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><polyline points={points('expenses')} fill="none" stroke="#4f7cff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="legend"><span className="gold-dot">Income {money(totalIncome)}</span><span className="blue-dot">Expenses {money(totalExpenses)}</span></div></div>
  </Card>;
}

function Dashboard({ totals, invoices, transactions, clients, setActive }) {
  const activeParticipants = clients.filter(c => !c.archived);
  const clientSpend = (clientId) => invoices.filter(i => i.clientId === clientId).reduce((s, i) => s + Number(i.total || 0), 0);
  const totalBudget = activeParticipants.reduce((s, c) => s + Number(c.budget || 0), 0);
  const usedBudget = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const budgetPct = totalBudget ? Math.min(100, Math.round((usedBudget / totalBudget) * 100)) : 0;
  const pendingInvoices = invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status)));
  const expiringParticipants = activeParticipants.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; });
  const complianceDue = getComplianceItems({ clients, invoices, totals }).length;
  const topParticipants = [...activeParticipants].sort((a, b) => clientSpend(b.id) - clientSpend(a.id)).slice(0, 5);

  return <>
    <div className="ops-hero-actions">
      <button className="primary" onClick={() => setActive('Participants')}>+ Participant</button>
      <button onClick={() => setActive('Invoices')}>+ Invoice</button>
      <button onClick={() => setActive('Finance')}>+ Expense</button>
    </div>
    <div className="stat-grid ops-stat-grid">
      <Stat label="Revenue" value={money(totals.income)} tone="navy" icon="$" trend="Income received" />
      <Stat label="Expenses" value={money(totals.expenses)} tone="blue" icon="−" trend="Billing and outgoings" />
      <Stat label="Net Position" value={money(totals.net)} tone="teal" icon="▣" trend="Revenue less expenses" />
      <Stat label="Active Participants" value={totals.activeClients} tone="green" icon="♙" trend={`${totals.expiringPlans} plans due in 30 days`} />
    </div>
    <div className="ops-insight-grid">
      <InsightCard label="NDIS Budget Usage" value={`${budgetPct}%`} sub={`${money(usedBudget)} used of ${money(totalBudget)}`} progress={budgetPct} />
      <InsightCard label="Plans Expiring Soon" value={expiringParticipants.length} sub="Within 30 days" />
      <InsightCard label="Pending Invoices" value={pendingInvoices.length} sub={money(pendingInvoices.reduce((s, i) => s + Number(i.total || 0), 0))} />
      <InsightCard label="Compliance Due" value={complianceDue} sub="Items needing review" />
    </div>
    <div className="dashboard-grid">
      <CashflowOverview transactions={transactions} />
      <Card title="Recent Invoices" action={<button className="text-link" onClick={() => setActive('Invoices')}>View all</button>}><Records rows={invoices.slice(0,4)} empty="No invoices yet." render={i => <div className="invoice-row" key={i.id}><span className="accent-line"/><div><b>{i.invoiceNumber}</b><small>{i.clientName}</small></div><strong>{money(i.total)}</strong><em>{normaliseInvoiceStatus(i.status)}</em><button onClick={() => setActive('Invoices')}>›</button></div>}/></Card>
    </div>
    <div className="bottom-grid">
      <Card title="Participant Budget Leaders"><Records rows={topParticipants} empty="No participants yet." render={(c) => { const spent = clientSpend(c.id); const budget = Number(c.budget || 0); const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0; return <div className="client-rank" key={c.id}><div className="mini-avatar">{(c.name||'P').split(' ').map(x=>x[0]).join('').slice(0,2)}</div><b>{c.name}</b><div className="bar"><span style={{width:`${pct || 6}%`}}/></div><strong>{money(spent)}</strong><small>{budget ? `${pct}% of ${money(budget)}` : 'No budget set'}</small></div>; }}/></Card>
      <Card title="Plan Watch"><Records rows={expiringParticipants.slice(0,4)} empty="No plans expiring soon." render={c => <div className="feed" key={c.id}><span>◷</span><div><b>{c.name}</b><small>{daysUntil(c.planEndDate)} days left · Ends {fmt(c.planEndDate)}</small></div><time>{money(Number(c.budget || 0))}</time></div>}/></Card>
      <Card title="Compliance Due"><Records rows={getComplianceItems({ clients, invoices, totals }).slice(0,4)} empty="No compliance items due." render={item => <div className="feed" key={item.id}><span>✓</span><div><b>{item.title}</b><small>{item.detail}</small></div><time>{item.status}</time></div>}/></Card>
    </div>
  </>;
}

function InsightCard({ label, value, sub, progress }) {
  return <div className="insight-card"><small>{label}</small><strong>{value}</strong><span>{sub}</span>{typeof progress === 'number' && <div className="bar"><span style={{ width: `${progress}%` }} /></div>}</div>;
}

function getComplianceItems({ clients, invoices, totals }) {
  const items = [];
  clients.filter(c => !c.archived).forEach(c => {
    const d = daysUntil(c.planEndDate);
    if (d !== null && d >= 0 && d <= 30) items.push({ id: `plan-${c.id}`, title: `${c.name} plan review`, detail: `Plan ends ${fmt(c.planEndDate)}`, status: `${d}d` });
    if (!c.ndisNumber) items.push({ id: `ndis-${c.id}`, title: `${c.name} NDIS number`, detail: 'Participant profile incomplete', status: 'Missing' });
  });
  invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status))).forEach(i => {
    const d = daysUntil(i.dueDate);
    if (d !== null && d < 0) items.push({ id: `invoice-${i.id}`, title: `Overdue invoice ${i.invoiceNumber}`, detail: i.clientName || 'Participant', status: `${Math.abs(d)}d overdue` });
  });
  return items;
}

function Clients({ clients, form, setForm, editing, save, edit, archive, del, cancel }) {
  const active = clients.filter(c => !c.archived);
  const archived = clients.filter(c => c.archived);
  const ClientTable = ({ rows, archivedView = false }) => <div className="client-table"><div className="client-table-head"><span>Participant</span><span>Plan</span><span>Budget</span><span>Contact</span><span>Actions</span></div><Records rows={rows} empty={archivedView ? 'No archived clients.' : 'No active participants added yet.'} render={c => <div className="client-table-row" key={c.id}><div><b>{c.name}</b><small>{c.address || '-'}</small></div><div><b>{c.ndisNumber || '-'}</b><small>{fmt(c.planStartDate)} → {fmt(c.planEndDate)}</small></div><div><b>{money(c.budget)}</b><small>{(() => { const d = daysUntil(c.planEndDate); return d === null ? 'No end date' : d < 0 ? 'Plan ended' : `${d} days left`; })()}</small></div><div><b>{c.email || '-'}</b><small>{c.phone || '-'}</small></div><div className="actions"><button onClick={() => edit(c)}>Edit</button><button onClick={() => archive(c.id)}>{archivedView ? 'Unarchive' : 'Archive'}</button><button className="danger" onClick={() => del(c.id)}>Delete</button></div></div>} /></div>;
  return <><Card title={editing ? 'Edit Participant' : 'Add Participant'}><div className="grid"><Field label="Participant Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/><Field label="NDIS Number" value={form.ndisNumber} onChange={e => setForm(p => ({ ...p, ndisNumber: e.target.value }))}/><Field type="date" label="Plan Start Date" value={form.planStartDate} onChange={e => setForm(p => ({ ...p, planStartDate: e.target.value }))}/><Field type="date" label="Plan End Date" value={form.planEndDate} onChange={e => setForm(p => ({ ...p, planEndDate: e.target.value }))}/><Field type="number" step="0.01" label="Budget" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}/><Field label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/><Field label="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/><Field label="Address" multiline value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}/></div><button className="primary" onClick={save}>{editing ? 'Update Participant' : 'Save Participant'}</button>{editing && <button onClick={cancel}>Cancel Edit</button>}</Card><Card title="Participants" action={`${active.length} active`}><ClientTable rows={active} /></Card><Card title="Archived Participants" action={`${archived.length} archived`}><ClientTable rows={archived} archivedView /></Card></>;
}

function Invoices({ pricingItems = DEFAULT_PRICING_ITEMS, clients, invoices, form, setForm, editing, setLine, selectItem, addLine, removeLine, save, edit, del, exportPDF, onStatusChange, cancel, query = '', setQuery = () => {} }) {
  const filteredInvoices = invoices.filter(i => `${i.invoiceNumber} ${i.clientName} ${i.status || ''}`.toLowerCase().includes(String(query).toLowerCase()));
  const preview = form.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0);
  return <><Card title={editing ? 'Edit Invoice' : 'Generate Invoice'}><div className="grid"><label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">Select active client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Field type="date" label="Due Date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}/></div>{form.lines.map((line, idx) => <div className="line" key={line.id}><div className="line-head"><h4>Service Line {idx + 1}</h4><button className="danger" onClick={() => removeLine(line.id)}>Remove</button></div><div className="grid"><label><span>Support Item</span><select value={line.itemCode || line.itemLabel} onChange={e => selectItem(line.id, e.target.value)}>{pricingItems.map(i => <option key={i.id || i.itemNumber} value={i.itemNumber || i.id}>{i.itemNumber ? `${i.itemNumber} — ${i.label}` : i.label}</option>)}</select></label><Field type="date" label="Service Date" value={line.serviceDate} onChange={e => setLine(line.id, 'serviceDate', e.target.value)}/><Field label="Unit Type" value={line.unitType} onChange={e => setLine(line.id, 'unitType', e.target.value)}/><Field type="number" step="0.01" label="Quantity" value={line.quantity} onChange={e => setLine(line.id, 'quantity', e.target.value)}/><Field type="number" step="0.01" label="Rate" value={line.rate} onChange={e => setLine(line.id, 'rate', e.target.value)}/><Field label="Line Notes" value={line.notes || ''} onChange={e => setLine(line.id, 'notes', e.target.value)} placeholder="Optional notes for this support item" /></div><b className="subtotal">Subtotal {money(Number(line.quantity || 0) * Number(line.rate || 0))}</b></div>)}<button onClick={addLine}>+ Add Another Service</button><Field label="Notes" multiline value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}/><div className="total">Invoice total: {money(preview)}</div><button className="primary" onClick={save}>{editing ? 'Update Invoice' : 'Generate Invoice'}</button>{editing && <button onClick={cancel}>Cancel Edit</button>}</Card><Card title="Invoice Register" action={<label className="inline-search"><input placeholder="Search invoices..." value={query} onChange={e => setQuery(e.target.value)} /></label>}><Records rows={filteredInvoices} empty="No invoices created yet." render={i => <details className="invoice-tile" key={i.id}><summary><div><b>{i.invoiceNumber}</b><small>{i.clientName}</small></div><strong>{money(i.total)}</strong><span className="pill">{i.status || 'Generated'}</span></summary><p>Issue: {fmt(i.issueDate)} · Due: {fmt(i.dueDate)} · NDIS: {i.ndisNumber || '-'}</p>{i.lines.map((l, idx) => <p key={l.id || idx}>{idx + 1}. {l.itemCode ? `${l.itemCode} · ` : ''}{l.itemLabel} · {fmt(l.serviceDate)} · {l.quantity} {l.unitType} @ {money(l.rate)} = {money(l.lineTotal)}</p>)}{i.notes && <p>Notes: {i.notes}</p>}<InvoiceStatusControls invoice={i} onChange={onStatusChange} /><div className="actions"><button onClick={() => edit(i)}>Edit</button><button onClick={() => exportPDF(i)}>Export PDF</button><button className="danger" onClick={() => del(i.id)}>Delete</button></div></details>}/></Card></>;
}


function InvoiceStatusControls({ invoice, onChange, compact = false }) {
  const [status, setStatus] = useState(normaliseInvoiceStatus(invoice.status));
  const [note, setNote] = useState(invoice.statusNote || '');
  useEffect(() => {
    setStatus(normaliseInvoiceStatus(invoice.status));
    setNote(invoice.statusNote || '');
  }, [invoice.id, invoice.status, invoice.statusNote]);
  const apply = () => onChange?.(invoice.id, status, note);
  const history = invoice.statusHistory || [];
  return <div className={compact ? 'invoice-status compact' : 'invoice-status'}>
    <div className="status-row">
      <label><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}>{INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label><span>Status note</span><input value={note} placeholder="Optional note" onChange={e => setNote(e.target.value)} /></label>
      <button className="primary" onClick={apply}>Update status</button>
    </div>
    {!compact && history.length > 0 && <small className="status-history">Last update: {history[history.length - 1].status} · {fmt(String(history[history.length - 1].at || '').slice(0,10))}{history[history.length - 1].note ? ` · ${history[history.length - 1].note}` : ''}</small>}
  </div>;
}

const PAGE_SIZE = 50;
const paginateRows = (rows, page, pageSize = PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { totalPages, safePage, start, pageRows: rows.slice(start, start + pageSize) };
};

function FinanceWorkspace({ clients, transactions, invoices = [], form, setForm, editing, save, edit, del, cancel }) {
  const [filters, setFilters] = useState({ type: 'all', status: 'all', clientId: 'all', sort: 'date_desc', query: '' });
  const [page, setPage] = useState(1);
  const rows = filterAndSortTransactions(transactions, filters);
  const { totalPages, safePage, start, pageRows } = paginateRows(rows, page);
  useEffect(() => { setPage(1); }, [filters.type, filters.status, filters.clientId, filters.sort, filters.query, transactions.length]);
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const income = rows.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount || 0),0);
  const expenses = rows.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount || 0),0);
  return <>
    <div className="finance-tabs"><span className="active">Transactions</span><span>Expenses</span><span>Invoice Sync</span></div>
    <Card title={editing ? 'Edit Billing / Outgoing' : 'New Expense or Transaction'}>
      <div className="grid"><label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">No Participant</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>Type</span><select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}><option>expense</option><option>income</option></select></label><label><span>Status</span><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}><option>pending</option><option>paid</option></select></label><Field label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}/><Field label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/><Field type="number" step="0.01" label="Amount" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}/><Field type="date" label="Date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}/></div>
      <button className="primary" onClick={save}>{editing ? 'Update Transaction' : 'Save Transaction'}</button>{editing && <button onClick={cancel}>Cancel Edit</button>}
    </Card>
    <Card title="Transaction Register" action={`${rows.length ? start + 1 : 0}-${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}`}>
      <div className="filters transaction-filters">
        <input value={filters.query} placeholder="Search description, client, category" onChange={e => setFilter('query', e.target.value)} />
        <select value={filters.type} onChange={e => setFilter('type', e.target.value)}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option></select>
        <select value={filters.status} onChange={e => setFilter('status', e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option></select>
        <select value={filters.clientId} onChange={e => setFilter('clientId', e.target.value)}><option value="all">All participants</option><option value="none">No participant</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={filters.sort} onChange={e => setFilter('sort', e.target.value)}><option value="date_desc">Newest date first</option><option value="date_asc">Oldest date first</option><option value="amount_desc">Highest amount first</option><option value="amount_asc">Lowest amount first</option></select>
      </div>
      <div className="mini-stats"><b>Income {money(income)}</b><b>Expenses {money(expenses)}</b><b>Net {money(income-expenses)}</b></div>
      <div className="txn-table"><div className="txn-table-head"><span>Transaction</span><span>Participant / Category</span><span>Date</span><span>Status</span><span>Amount</span><span>Actions</span></div><Records rows={pageRows} empty="No matching transactions found." render={t => <div className="txn-row" key={t.id}><div><b>{t.description}</b><small>{t.invoiceNumber ? `Invoice ${t.invoiceNumber}` : t.type}</small></div><div><b>{t.clientName || 'No Participant'}</b><small>{t.category || 'General'}</small></div><time>{fmt(t.date)}</time><span className="pill">{t.status}</span><strong className={t.type === 'expense' ? 'negative' : 'positive'}>{t.type === 'expense' ? '-' : '+'}{money(t.amount)}</strong><div className="actions"><button onClick={() => edit(t)}>Edit</button><button className="danger" onClick={() => del(t.id)}>Delete</button></div></div>}/></div>{rows.length > PAGE_SIZE && <Pagination page={safePage} totalPages={totalPages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} />}</Card>
  </>;
}

function ComplianceWorkspace({ clients, invoices, totals }) {
  const rows = getComplianceItems({ clients, invoices, totals });
  return <><Card title="Compliance Workspace" action={`${rows.length} due`}><p>Track participant plan reviews, missing participant details, overdue invoices, and future company compliance reminders.</p><div className="compliance-grid"><InsightCard label="Participant reviews" value={clients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; }).length} sub="Plans ending within 30 days" /><InsightCard label="Overdue invoices" value={invoices.filter(i => { const d = daysUntil(i.dueDate); return !['Paid','Cancelled'].includes(normaliseInvoiceStatus(i.status)) && d !== null && d < 0; }).length} sub="Unpaid beyond due date" /><InsightCard label="Profile gaps" value={clients.filter(c => !c.archived && !c.ndisNumber).length} sub="Missing NDIS numbers" /></div></Card><Card title="Compliance Items"><Records rows={rows} empty="No compliance items due." render={item => <div className="compliance-row" key={item.id}><div><b>{item.title}</b><small>{item.detail}</small></div><span className="pill">{item.status}</span></div>} /></Card></>;
}

function FutureWorkspace({ title, description }) {
  return <Card title={title}><div className="future-panel"><b>{title} is coming soon</b><p>{description}</p><button className="primary" disabled>Planned module</button></div></Card>;
}

function Pagination({ page, totalPages, onPrev, onNext }) {
  return <div className="pagination"><button onClick={onPrev} disabled={page <= 1}>Previous</button><span>Page {page} of {totalPages}</span><button onClick={onNext} disabled={page >= totalPages}>Next</button></div>;
}

function Settings({ pricingItems, business, setBusiness, saveBusiness, clients, invoices, transactions, backup, restore, clear, sync, load, user }) {
  const [draft, setDraft] = useState({ ...EMPTY_BUSINESS, ...business });
  const [businessOpen, setBusinessOpen] = useState(false);

  useEffect(() => {
    setDraft({ ...EMPTY_BUSINESS, ...business });
  }, [business]);

  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  return <>
    <Card title="Business Profile" action={<button type="button" className="text-link" onClick={() => setBusinessOpen(open => !open)}>{businessOpen ? 'Collapse' : 'Edit Profile'}</button>}>
      <div className="settings-summary">
        <div className="logo-preview compact">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'KC').slice(0,2).toUpperCase()}</span>}</div>
        <div>
          <b>{draft.name || 'Business profile not completed'}</b>
          <small>{[draft.abn, draft.email, draft.phone].filter(Boolean).join(' · ') || 'Details shown on invoices. Open only when you need to update them.'}</small>
        </div>
      </div>
      {businessOpen && <>
        <p>This information is private to the signed-in workspace and appears on exported invoices.</p>
        <div className="logo-uploader">
          <div className="logo-preview">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'KC').slice(0,2).toUpperCase()}</span>}</div>
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
        <button className="primary" onClick={() => { saveBusiness(draft); setBusinessOpen(false); }}>Save Business Profile</button>
      </>}
    </Card>
    <NdisPricingManager
      items={draft.pricingItems || DEFAULT_PRICING_ITEMS}
      onChange={(nextItems) => updateDraft('pricingItems', nextItems)}
      onSave={() => saveBusiness({ ...draft, pricingItems: draft.pricingItems || DEFAULT_PRICING_ITEMS })}
    />
    <Card title="Backup, Restore & Cloud Sync"><p>Works offline with local storage. Supabase sync is tied to your signed-in account and includes your business profile and NDIS pricing table.</p><button onClick={backup}>Export Backup JSON</button><label className="file">Import Backup JSON<input type="file" accept="application/json" onChange={e => e.target.files?.[0] && restore(e.target.files[0])}/></label><button className="primary" onClick={sync}>Sync to Supabase</button><button onClick={load}>Load from Supabase</button><button className="danger" onClick={clear}>Clear All Data</button></Card>
    <Card title="Data Summary"><div className="mini-stats"><b>Business: {business.name || 'Not set'}</b><b>Pricing Items: {getPricingItems(business).length}</b><b>Clients: {clients.length}</b><b>Invoices: {invoices.length}</b><b>Transactions: {transactions.length}</b></div></Card>
    <Card title="Cloud Status"><p><b>{isSupabaseConfigured ? 'Supabase Connected' : 'Local Mode'}</b></p><p>{isSupabaseConfigured ? `Signed in as ${user?.email || 'your account'}. Your cloud snapshot is private to this login.` : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages variables, public/supabase-config.js, or the app setup screen.'}</p><p><small>Config source: {supabaseConfigSource}</small></p><button onClick={async () => supabase && supabase.auth.signOut()}>Sign out</button></Card>
  </>;
}


function NdisPricingManager({ items, onChange, onSave }) {
  const [query, setQuery] = useState('');
  const [editingRates, setEditingRates] = useState(false);
  const pricingItems = getPricingItems({ pricingItems: items });
  const groups = [...new Set(pricingItems.map(item => item.group || 'Custom Items'))];
  const filtered = pricingItems.filter(item => `${item.group} ${item.itemNumber} ${item.label} ${item.unitType}`.toLowerCase().includes(query.toLowerCase()));
  const updateItem = (id, field, value) => {
    if (field === 'rate' && !editingRates) return;
    onChange(pricingItems.map(item => item.id === id ? { ...item, [field]: field === 'rate' ? Number(value || 0) : value } : item));
  };
  const addItem = () => {
    onChange([
      ...pricingItems,
      { id: makeId('pricing'), group: 'Custom Items', itemNumber: '', label: 'New support item', unitType: 'Hour', rate: 0, archived: false },
    ]);
    setEditingRates(true);
  };
  const restoreDefaults = () => {
    if (confirm('Restore default NDIS pricing items? This will replace your custom pricing table.')) onChange(DEFAULT_PRICING_ITEMS);
  };
  const savePricing = () => {
    onSave();
    setEditingRates(false);
  };
  return <Card title="NDIS Pricing Manager" action={`${pricingItems.filter(i => !i.archived).length} active items`}>
    <p>Manage support item numbers, descriptions, units and annual NDIS rates here. Rate fields are locked by default so prices are not changed by mistake. Invoice generation uses this table for future invoices.</p>
    <div className="settings-toolbar">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search item number, name, group or unit" />
      <button onClick={addItem}>+ Add Item</button>
      <button onClick={restoreDefaults}>Restore Defaults</button>
      <button type="button" className={editingRates ? 'danger' : ''} onClick={() => setEditingRates(value => !value)}>{editingRates ? 'Lock Rates' : 'Edit Rates'}</button>
      <button className="primary" onClick={savePricing}>Save Pricing</button>
    </div>
    <div className="rate-lock-note">{editingRates ? 'Rate editing is unlocked. Review changes carefully before saving.' : 'Rates are locked. Click Edit Rates to update annual NDIS prices.'}</div>
    <div className="pricing-groups">
      {groups.map(group => {
        const groupRows = filtered.filter(item => item.group === group);
        if (!groupRows.length) return null;
        return <section className="pricing-group" key={group}>
          <div className="pricing-group-head"><h4>{group}</h4><small>{groupRows.length} item{groupRows.length === 1 ? '' : 's'}</small></div>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Active</th><th>Item Number</th><th>Item Name and Notes</th><th>Unit</th><th>National Rate</th></tr></thead>
              <tbody>{groupRows.map(item => <tr key={item.id} className={item.archived ? 'archived' : ''}>
                <td><input type="checkbox" checked={!item.archived} onChange={e => updateItem(item.id, 'archived', !e.target.checked)} /></td>
                <td><input value={item.itemNumber} onChange={e => updateItem(item.id, 'itemNumber', e.target.value)} placeholder="01_011_0107_1_1" /></td>
                <td><input value={item.label} onChange={e => updateItem(item.id, 'label', e.target.value)} /></td>
                <td><input value={item.unitType} onChange={e => updateItem(item.id, 'unitType', e.target.value)} placeholder="Hour" /></td>
                <td><input className="rate-input" type="number" step="0.01" value={item.rate} readOnly={!editingRates} aria-readonly={!editingRates} title={editingRates ? 'Rate editing unlocked' : 'Rates are locked. Click Edit Rates to unlock.'} onChange={e => updateItem(item.id, 'rate', e.target.value)} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>;
      })}
    </div>
  </Card>;
}

function BusinessOnboarding({ business, onSave, user, onLoadCloud, cloudLoading }) {
  const [draft, setDraft] = useState({ ...EMPTY_BUSINESS, ...business });
  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  return <div className="auth-shell">
    <section className="auth-hero">
      <div className="crown">♛</div>
      <h1>Set up your business</h1>
      <p>Personalise Kajola Care for your invoices, payment details and workspace branding.</p>
      <div className="auth-glass"><b>{user?.email || 'Your account'}</b><span>This profile is saved in your private cloud snapshot.</span></div>
      <button className="ghost" type="button" onClick={onLoadCloud} disabled={cloudLoading}>{cloudLoading ? 'Loading cloud…' : 'Load existing cloud profile'}</button>
    </section>
    <form className="auth-card" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
      <h2>Business onboarding</h2>
      <p>Enter the details you want shown on invoices. You can edit these later in Settings.</p>
      <div className="logo-uploader compact">
        <div className="logo-preview">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'KC').slice(0,2).toUpperCase()}</span>}</div>
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
  return <div className="auth-shell"><div className="auth-card"><BrandMark /><BrandWordmark hero /><p>{message}</p></div></div>;
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
      <section className="auth-hero"><BrandMark /><BrandWordmark hero /><p>Care • Connect • Empower</p><div className="auth-glass"><b>Supabase setup required</b><span>Paste your new Kajola Care project URL and anon public key once. The app will save it in this browser.</span></div></section>
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
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName || 'Kajola Care User' } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Account created. Check your email to confirm your sign up, then sign in.');
    else setMessage('Signed in. Loading workspace…');
  }

  return <div className="auth-shell">
    <section className="auth-hero"><BrandMark /><BrandWordmark hero /><p>Care • Connect • Empower</p><div className="auth-glass"><b>Private cloud workspace</b><span>Participants, invoices, finance and snapshots protected by Supabase Auth.</span></div></section>
    <form className="auth-card" onSubmit={submit}>
      <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
      <p>{mode === 'signup' ? 'Start a secure Kajola Care workspace.' : 'Sign in to continue to your dashboard.'}</p>
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
