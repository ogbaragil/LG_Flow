import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'lg_flow_pwa_v1';
const TABS = ['Dashboard', 'Clients', 'Invoices', 'Transactions', 'Settings'];
const BUSINESS = {
  name: "Life's Good Disability Services",
  abn: 'ABN 616 600 252 94',
  email: 'hola@lgds.com.au',
  phone: '0450 696 350',
  address: '36 Sankuru Road, Truganina',
  paymentDetails: "Life's Good Disability Services\nBank: Common Wealth Bank\nBSB: 067 873\nAccount: 1866 9873",
};
const ITEMS = [
  { label: 'Self-Care Support', rate: 70.23, unitType: 'hours' },
  { label: 'Community Access', rate: 70.23, unitType: 'hours' },
  { label: 'Transport', rate: 1, unitType: 'km' },
  { label: 'Establishment Fee for Personal Care/Participation', rate: 702.3, unitType: 'hours' },
];
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const id = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const fmt = (d) => d ? new Date(d).toLocaleDateString() : '-';
const emptyClient = { name: '', ndisNumber: '', email: '', phone: '', address: '' };
const emptyLine = () => ({ id: id('line'), itemLabel: ITEMS[0].label, serviceDate: todayISO(), unitType: 'hours', quantity: '1', rate: String(ITEMS[0].rate) });
const emptyInvoice = () => ({ clientId: '', dueDate: addDaysISO(7), notes: '', lines: [emptyLine()] });
const emptyTxn = { clientId: '', type: 'expense', status: 'pending', category: '', description: '', amount: '', date: todayISO() };

async function syncToSupabase(payload) {
  if (!supabase) return { ok: false, message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' };
  const { error } = await supabase.from('app_snapshots').upsert({ id: 'default', payload, updated_at: new Date().toISOString() });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced to Supabase.' };
}
async function loadFromSupabase() {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  const { data, error } = await supabase.from('app_snapshots').select('payload').eq('id', 'default').single();
  return error ? { ok: false, message: error.message } : { ok: true, payload: data?.payload };
}

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice());
  const [txnForm, setTxnForm] = useState(emptyTxn);
  const [editingClient, setEditingClient] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editingTxn, setEditingTxn] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { try { const d = JSON.parse(raw); setClients(d.clients || []); setInvoices(d.invoices || []); setTransactions(d.transactions || []); } catch {} }
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ clients, invoices, transactions })); }, [clients, invoices, transactions]);

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount||0),0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount||0),0);
    return { clients: clients.filter(c=>!c.archived).length, invoices: invoices.length, income, expenses, net: income-expenses };
  }, [clients, invoices, transactions]);

  const saveClient = () => {
    if (!clientForm.name.trim()) return alert('Please enter the client name.');
    if (editingClient) setClients(prev => prev.map(c => c.id === editingClient ? { ...c, ...clientForm, updatedAt: new Date().toISOString() } : c));
    else setClients(prev => [{ id: id('client'), archived: false, createdAt: new Date().toISOString(), ...clientForm }, ...prev]);
    setClientForm(emptyClient); setEditingClient(null);
  };
  const editClient = (c) => { setClientForm({ name:c.name||'', ndisNumber:c.ndisNumber||'', email:c.email||'', phone:c.phone||'', address:c.address||'' }); setEditingClient(c.id); window.scrollTo(0,0); };
  const archiveClient = (cid) => setClients(prev => prev.map(c => c.id === cid ? { ...c, archived: !c.archived } : c));
  const deleteClient = (cid) => invoices.some(i=>i.clientId===cid) ? alert('This client has invoices and cannot be deleted.') : setClients(prev=>prev.filter(c=>c.id!==cid));

  const setLine = (lid, field, value) => setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lid ? { ...l, [field]: value } : l) }));
  const selectItem = (lid, label) => { const item = ITEMS.find(i=>i.label===label); setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id===lid ? { ...l, itemLabel: label, rate: String(item.rate), unitType: item.unitType } : l) })); };
  const saveInvoice = () => {
    const client = clients.find(c => c.id === invoiceForm.clientId && !c.archived);
    if (!client) return alert('Please select an active client.');
    const lines = invoiceForm.lines.map(l => ({ ...l, quantity: Number(l.quantity), rate: Number(l.rate), lineTotal: Number(l.quantity) * Number(l.rate) }));
    if (lines.some(l => !l.quantity || l.quantity <= 0 || Number.isNaN(l.rate))) return alert('Check quantity and rate values.');
    const total = lines.reduce((s,l)=>s+l.lineTotal,0);
    if (editingInvoice) setInvoices(prev => prev.map(inv => inv.id === editingInvoice ? { ...inv, clientId: client.id, clientName: client.name, clientEmail: client.email, clientPhone: client.phone, clientAddress: client.address, ndisNumber: client.ndisNumber, dueDate: invoiceForm.dueDate, notes: invoiceForm.notes, lines, total } : inv));
    else {
      const stamp = todayISO().replace(/-/g,''); const n = invoices.filter(i => String(i.invoiceNumber).startsWith(`INV-${stamp}-`)).length + 1;
      setInvoices(prev => [{ id: id('invoice'), invoiceNumber: `INV-${stamp}-${String(n).padStart(3,'0')}`, clientId: client.id, clientName: client.name, clientEmail: client.email, clientPhone: client.phone, clientAddress: client.address, ndisNumber: client.ndisNumber, issueDate: todayISO(), dueDate: invoiceForm.dueDate, lines, total, notes: invoiceForm.notes, status: 'Generated', createdAt: new Date().toISOString() }, ...prev]);
    }
    setInvoiceForm(emptyInvoice()); setEditingInvoice(null);
  };
  const editInvoice = (inv) => { setInvoiceForm({ clientId: inv.clientId, dueDate: inv.dueDate, notes: inv.notes || '', lines: inv.lines.map(l => ({ ...l, quantity: String(l.quantity), rate: String(l.rate) })) }); setEditingInvoice(inv.id); window.scrollTo(0,0); };
  const exportPDF = (inv) => {
    const doc = new jsPDF(); let y = 18;
    doc.setFontSize(20); doc.text('Invoice', 14, y); y += 9; doc.setFontSize(10);
    [BUSINESS.name, BUSINESS.abn, BUSINESS.address, BUSINESS.phone, BUSINESS.email, '', `Invoice No: ${inv.invoiceNumber}`, `Issue Date: ${fmt(inv.issueDate)}`, `Due Date: ${fmt(inv.dueDate)}`, '', `Billed To: ${inv.clientName}`, inv.ndisNumber ? `NDIS: ${inv.ndisNumber}` : '', inv.clientAddress || '', '', 'Payment Details:', ...BUSINESS.paymentDetails.split('\n')].filter(Boolean).forEach(line => { doc.text(String(line), 14, y); y += 6; });
    y += 3; doc.text('Services', 14, y); y += 7;
    inv.lines.forEach((l, i) => { doc.text(`${i+1}. ${fmt(l.serviceDate)} - ${l.itemLabel} - ${l.quantity} ${l.unitType} @ ${money(l.rate)} = ${money(l.lineTotal)}`, 14, y); y += 7; if (y > 280) { doc.addPage(); y = 18; } });
    y += 4; doc.setFontSize(14); doc.text(`Total: ${money(inv.total)}`, 14, y); doc.save(`LGDS_${inv.clientName}_${inv.invoiceNumber}.pdf`);
  };

  const saveTxn = () => {
    const amount = Number(txnForm.amount); if (!txnForm.description.trim() || !amount || amount <= 0) return alert('Enter a description and amount greater than zero.');
    const client = clients.find(c=>c.id===txnForm.clientId);
    const payload = { ...txnForm, amount, clientName: client?.name || '' };
    if (editingTxn) setTransactions(prev=>prev.map(t=>t.id===editingTxn?{...t,...payload,updatedAt:new Date().toISOString()}:t));
    else setTransactions(prev=>[{ id:id('txn'), ...payload, createdAt:new Date().toISOString() }, ...prev]);
    setTxnForm(emptyTxn); setEditingTxn(null);
  };
  const editTxn = (t) => { setTxnForm({ clientId:t.clientId||'', type:t.type||'expense', status:t.status||'paid', category:t.category||'', description:t.description||'', amount:String(t.amount||''), date:t.date||todayISO() }); setEditingTxn(t.id); window.scrollTo(0,0); };

  const backup = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: { clients, invoices, transactions } }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lg-flow-backup.json'; a.click(); };
  const restore = async (file) => { const text = await file.text(); const parsed = JSON.parse(text); const data = parsed.data || parsed; setClients(data.clients||[]); setInvoices(data.invoices||[]); setTransactions(data.transactions||[]); };
  const payload = { clients, invoices, transactions };

  return <div className="app"><header><h1>LG-Flow</h1><p>Clients, invoices, income, and expenses.</p></header>{notice && <div className="notice">{notice}</div>}<nav>{TABS.map(t=><button key={t} className={active===t?'active':''} onClick={()=>setActive(t)}>{t}</button>)}</nav>
    {active==='Dashboard' && <Dashboard totals={totals} invoices={invoices} transactions={transactions}/>} 
    {active==='Clients' && <section><Card title={editingClient?'Edit NDIS Client':'Add NDIS Client'}><ClientForm form={clientForm} setForm={setClientForm}/><button className="primary" onClick={saveClient}>{editingClient?'Update Client':'Save Client'}</button>{editingClient&&<button onClick={()=>{setEditingClient(null);setClientForm(emptyClient)}}>Cancel</button>}</Card><Card title="Saved Clients"><Records rows={clients.filter(c=>!c.archived)} empty="No active clients." render={c=><ClientCard c={c} edit={editClient} archive={archiveClient} del={deleteClient}/>} /></Card><Card title="Archived Clients"><Records rows={clients.filter(c=>c.archived)} empty="No archived clients." render={c=><ClientCard c={c} edit={editClient} archive={archiveClient} del={deleteClient}/>} /></Card></section>}
    {active==='Invoices' && <section><Card title={editingInvoice?'Edit Invoice':'Generate Invoice'}><InvoiceForm form={invoiceForm} setForm={setInvoiceForm} clients={clients.filter(c=>!c.archived)} selectItem={selectItem} setLine={setLine}/><div className="total">Invoice total: {money(invoiceForm.lines.reduce((s,l)=>s+Number(l.quantity||0)*Number(l.rate||0),0))}</div><button className="primary" onClick={saveInvoice}>{editingInvoice?'Update Invoice':'Generate Invoice'}</button>{editingInvoice&&<button onClick={()=>{setEditingInvoice(null);setInvoiceForm(emptyInvoice())}}>Cancel</button>}</Card><Card title="Invoice Register"><Records rows={invoices} empty="No invoices." render={inv=><InvoiceCard inv={inv} edit={editInvoice} del={(iid)=>setInvoices(p=>p.filter(i=>i.id!==iid))} pdf={exportPDF}/>} /></Card></section>}
    {active==='Transactions' && <section><Card title={editingTxn?'Edit Business Transaction':'Record Business Transaction'}><TxnForm form={txnForm} setForm={setTxnForm} clients={clients.filter(c=>!c.archived)}/><button className="primary" onClick={saveTxn}>{editingTxn?'Update Transaction':'Save Transaction'}</button>{editingTxn&&<button onClick={()=>{setEditingTxn(null);setTxnForm(emptyTxn)}}>Cancel</button>}</Card><Transactions transactions={transactions} edit={editTxn} del={(tid)=>setTransactions(p=>p.filter(t=>t.id!==tid))}/></section>}
    {active==='Settings' && <section><Card title="Backup, Restore & Cloud Sync"><p>Works offline with local storage. Supabase sync is enabled when environment variables are configured.</p><button onClick={backup}>Export Backup JSON</button><label className="file">Import Backup JSON <input type="file" accept="application/json" onChange={e=>e.target.files?.[0]&&restore(e.target.files[0])}/></label><button onClick={async()=>setNotice((await syncToSupabase(payload)).message)}>Sync to Supabase</button><button onClick={async()=>{const r=await loadFromSupabase(); if(r.ok&&r.payload){setClients(r.payload.clients||[]);setInvoices(r.payload.invoices||[]);setTransactions(r.payload.transactions||[]);setNotice('Loaded from Supabase.')} else setNotice(r.message)}}>Load from Supabase</button><button className="danger" onClick={()=>confirm('Clear all data?')&&(setClients([]),setInvoices([]),setTransactions([]))}>Clear All Data</button></Card><Card title="Data Summary"><p>Clients: {clients.length}</p><p>Invoices: {invoices.length}</p><p>Transactions: {transactions.length}</p></Card></section>}
  </div>;
}
function Card({title,children}){return <div className="card"><h2>{title}</h2>{children}</div>}
function Field({label, ...props}){return <label><span>{label}</span><input {...props}/></label>}
function TextArea({label, ...props}){return <label><span>{label}</span><textarea {...props}/></label>}
function ClientForm({form,setForm}){return <div className="grid"><Field label="Client Name" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/><Field label="NDIS Number" value={form.ndisNumber} onChange={e=>setForm(p=>({...p,ndisNumber:e.target.value}))}/><Field label="Email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/><Field label="Phone" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/><TextArea label="Address" value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))}/></div>}
function Records({rows,empty,render}){return rows.length?rows.map(render):<p className="empty">{empty}</p>}
function ClientCard({c,edit,archive,del}){return <div className="record"><h3>{c.name}</h3><p>NDIS: {c.ndisNumber||'-'}</p><p>Email: {c.email||'-'} · Phone: {c.phone||'-'}</p><p>{c.address||'-'}</p><div className="actions"><button onClick={()=>edit(c)}>Edit</button><button onClick={()=>archive(c.id)}>{c.archived?'Unarchive':'Archive'}</button><button className="danger" onClick={()=>del(c.id)}>Delete</button></div></div>}
function InvoiceForm({form,setForm,clients,selectItem,setLine}){return <><label><span>Client</span><select value={form.clientId} onChange={e=>setForm(p=>({...p,clientId:e.target.value}))}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Field type="date" label="Due Date" value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))}/>{form.lines.map((l,i)=><div className="line" key={l.id}><h3>Service Line {i+1}</h3><label><span>Support Item</span><select value={l.itemLabel} onChange={e=>selectItem(l.id,e.target.value)}>{ITEMS.map(item=><option key={item.label}>{item.label}</option>)}</select></label><Field type="date" label="Service Date" value={l.serviceDate} onChange={e=>setLine(l.id,'serviceDate',e.target.value)}/><Field label="Unit Type" value={l.unitType} onChange={e=>setLine(l.id,'unitType',e.target.value)}/><Field type="number" step="0.01" label="Quantity" value={l.quantity} onChange={e=>setLine(l.id,'quantity',e.target.value)}/><Field type="number" step="0.01" label="Rate" value={l.rate} onChange={e=>setLine(l.id,'rate',e.target.value)}/><button onClick={()=>setForm(p=>({...p,lines:p.lines.length===1?p.lines:p.lines.filter(x=>x.id!==l.id)}))}>Remove Line</button></div>)}<button onClick={()=>setForm(p=>({...p,lines:[...p.lines,emptyLine()]}))}>+ Add Another Service</button><TextArea label="Notes" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/></>}
function InvoiceCard({inv,edit,del,pdf}){return <details className="record"><summary><strong>{inv.invoiceNumber} · {inv.clientName}</strong><span>{money(inv.total)}</span></summary><p>Issue: {fmt(inv.issueDate)} · Due: {fmt(inv.dueDate)} · Status: {inv.status}</p>{inv.lines.map((l,i)=><p key={l.id||i}>{i+1}. {fmt(l.serviceDate)} · {l.itemLabel} · {l.quantity} {l.unitType} @ {money(l.rate)} = {money(l.lineTotal)}</p>)}<h3>Total: {money(inv.total)}</h3><div className="actions"><button onClick={()=>edit(inv)}>Edit</button><button onClick={()=>pdf(inv)}>Export PDF</button><button className="danger" onClick={()=>del(inv.id)}>Delete</button></div></details>}
function TxnForm({form,setForm,clients}){return <div className="grid"><label><span>Client</span><select value={form.clientId} onChange={e=>setForm(p=>({...p,clientId:e.target.value}))}><option value="">No Client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>Type</span><select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}><option>expense</option><option>income</option></select></label><label><span>Status</span><select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}><option>pending</option><option>paid</option></select></label><Field label="Category" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}/><Field label="Description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}/><Field type="number" step="0.01" label="Amount" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}/><Field type="date" label="Date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></div>}
function Transactions({transactions,edit,del}){const [type,setType]=useState('all'); const [status,setStatus]=useState('all'); const filtered=transactions.filter(t=>(type==='all'||t.type===type)&&(status==='all'||t.status===status)); const income=filtered.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0); const expenses=filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0); return <Card title="Transaction Register"><div className="filters"><select value={type} onChange={e=>setType(e.target.value)}><option>all</option><option>income</option><option>expense</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option>all</option><option>pending</option><option>paid</option></select></div><div className="stats"><b>Income {money(income)}</b><b>Expenses {money(expenses)}</b><b>Net {money(income-expenses)}</b></div><Records rows={filtered} empty="No matching transactions." render={t=><div className="record" key={t.id}><h3>{t.description} <span>{t.type==='expense'?'-':'+'}{money(t.amount)}</span></h3><p>{t.clientName||'No Client'} · {t.category||'General'} · {fmt(t.date)} · {t.status}</p><div className="actions"><button onClick={()=>edit(t)}>Edit</button><button className="danger" onClick={()=>del(t.id)}>Delete</button></div></div>}/></Card>}
function Dashboard({totals,invoices,transactions}){return <><div className="stats"><Stat label="Active Clients" value={totals.clients}/><Stat label="Invoices" value={totals.invoices}/><Stat label="Income" value={money(totals.income)}/><Stat label="Expenses" value={money(totals.expenses)}/><Stat label="Net" value={money(totals.net)}/></div><Card title="Recent Invoices"><Records rows={invoices.slice(0,5)} empty="No invoices yet." render={i=><p key={i.id}>{i.invoiceNumber} · {i.clientName} · {money(i.total)}</p>}/></Card><Card title="Recent Transactions"><Records rows={transactions.slice(0,5)} empty="No transactions yet." render={t=><p key={t.id}>{t.description} · {t.type} · {money(t.amount)}</p>}/></Card></>}
function Stat({label,value}){return <div className="stat"><strong>{value}</strong><span>{label}</span></div>}
