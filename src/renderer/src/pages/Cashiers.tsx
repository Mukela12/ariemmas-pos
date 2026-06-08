import { useEffect, useState, useCallback } from 'react'
import { Eye, EyeOff, KeyRound, Pencil, UserPlus, X, ShieldCheck, User as UserIcon, Loader2 } from 'lucide-react'
import { NumberKeypad } from '../components/NumberKeypad'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import type { ManagedUser } from '../../../shared/types'

export function Cashiers() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [pinFor, setPinFor] = useState<ManagedUser | null>(null)
  const [renameFor, setRenameFor] = useState<ManagedUser | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const list = await window.api.listUsers!()
      setUsers(list)
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Could not load cashiers.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600) }
  const toggleReveal = (id: string) =>
    setRevealed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const admins = users.filter((u) => u.role === 'admin' || u.role === 'manager')
  const cashiers = users.filter((u) => u.role === 'cashier')

  const Row = ({ u }: { u: ManagedUser }) => (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F4F4F5] last:border-0">
      <div className={`w-9 h-9 rounded-[3px] flex items-center justify-center shrink-0 ${u.role === 'cashier' ? 'bg-[#F4F4F5] text-[#71717A]' : 'bg-[#F0FDFA] text-[#0D9488]'}`}>
        {u.role === 'cashier' ? <UserIcon size={17} /> : <ShieldCheck size={17} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-[#18181B] truncate">{u.display_name}</span>
          <button onClick={() => setRenameFor(u)} title="Rename" className="text-[#A1A1AA] hover:text-[#0D9488] shrink-0"><Pencil size={13} /></button>
        </div>
        <span className="text-[12px] text-[#A1A1AA] font-mono">{u.username}</span>
      </div>
      {/* Current PIN */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[15px] font-bold tabular-nums tracking-[0.15em] text-[#18181B] w-[64px] text-right">
          {revealed.has(u.id) ? (u.pin || '—') : '••••'}
        </span>
        <button onClick={() => toggleReveal(u.id)} title={revealed.has(u.id) ? 'Hide' : 'Show'}
          className="w-8 h-8 rounded-[2px] border border-[#E4E4E7] flex items-center justify-center text-[#71717A] hover:bg-[#F4F4F5]">
          {revealed.has(u.id) ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <button onClick={() => setPinFor(u)}
        className="btn-graphite h-9 px-3 text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0">
        <KeyRound size={14} /> Set PIN
      </button>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto bg-[#F4F4F5]">
      <div className="max-w-[760px] mx-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[20px] font-bold text-[#18181B] tracking-tight">Cashiers &amp; Admins</h1>
            <p className="text-[13px] text-[#71717A] mt-0.5">View current logins, reset PINs, or add a cashier. Changes save to the credentials file in Downloads.</p>
          </div>
          <button onClick={() => setAdding(true)} className="btn-teal h-10 px-4 text-[13px] font-semibold flex items-center gap-2">
            <UserPlus size={16} /> Add cashier
          </button>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[2px] text-[13px] text-[#DC2626]">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#A1A1AA]"><Loader2 size={22} className="animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <Section title="Administrators" hint="Full access to the whole system">{admins.map((u) => <Row key={u.id} u={u} />)}</Section>
            <Section title="Cashiers" hint="Till only — sell, take payment, open/close their shift">{cashiers.map((u) => <Row key={u.id} u={u} />)}</Section>
          </div>
        )}
      </div>

      {pinFor && (
        <SetPinModal user={pinFor} onClose={() => setPinFor(null)}
          onSaved={() => { setPinFor(null); flash('PIN updated'); load() }} onError={setError} />
      )}
      {renameFor && (
        <RenameModal user={renameFor} onClose={() => setRenameFor(null)}
          onSaved={() => { setRenameFor(null); flash('Name updated'); load() }} onError={setError} />
      )}
      {adding && (
        <AddCashierModal onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); flash('Cashier added'); load() }} onError={setError} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-[3px] bg-[#0D9488] text-white text-[13.5px] font-semibold shadow-lg">{toast}</div>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E4E4E7] rounded-[3px] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#F4F4F5]">
        <h2 className="text-[13px] font-semibold text-[#18181B]">{title}</h2>
        <p className="text-[11px] text-[#A1A1AA] mt-0.5">{hint}</p>
      </div>
      {children}
    </div>
  )
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-[400px] bg-white rounded-[3px] shadow-xl overflow-y-auto max-h-[96vh]" onClick={(e) => e.stopPropagation()}>
        <div className="graphite px-5 py-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-[12px] text-white/55 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-[2px] flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function SetPinModal({ user, onClose, onSaved, onError }: { user: ManagedUser; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const ok = /^\d{4,6}$/.test(pin)
  const save = async () => {
    if (!ok || saving) return
    setSaving(true)
    try {
      const r = await window.api.setUserPin!(user.id, pin)
      if (r.ok) onSaved(); else onError(r.error || 'Could not set PIN.')
    } catch (e: any) { onError(e?.message || 'Could not set PIN.') } finally { setSaving(false) }
  }
  return (
    <ModalShell title={`New PIN for ${user.display_name}`} subtitle={`username: ${user.username}`} onClose={onClose}>
      <div className="w-full h-14 px-4 rounded-[2px] border border-[#E4E4E7] bg-[#FAFAFA] flex items-center justify-center text-[30px] font-bold tabular-nums tracking-[0.3em] text-[#18181B]">
        {pin || <span className="text-[#D4D4D8]">••••</span>}
      </div>
      <p className="text-[11px] text-[#A1A1AA] text-center">4 to 6 digits. The cashier uses this to sign in.</p>
      <NumberKeypad value={pin} onChange={setPin} onEnter={save} enterLabel={saving ? '…' : 'SAVE'} enterTone="teal" enterDisabled={!ok || saving} maxLength={6} />
    </ModalShell>
  )
}

function RenameModal({ user, onClose, onSaved, onError }: { user: ManagedUser; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState(user.display_name)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const r = await window.api.renameUser!(user.id, name.trim())
      if (r.ok) onSaved(); else onError(r.error || 'Could not rename.')
    } catch (e: any) { onError(e?.message || 'Could not rename.') } finally { setSaving(false) }
  }
  return (
    <ModalShell title="Rename" subtitle={`username: ${user.username}`} onClose={onClose}>
      <div className="w-full min-h-12 px-3 py-2.5 rounded-[2px] border border-[#0D9488] bg-white text-[15px] text-[#18181B]">{name || <span className="text-[#A1A1AA]">Type a name…</span>}</div>
      <OnScreenKeyboard value={name} onChange={setName} onEnter={save} onClose={onClose} />
    </ModalShell>
  )
}

function AddCashierModal({ onClose, onSaved, onError }: { onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [field, setField] = useState<'username' | 'name' | 'pin'>('username')
  const [saving, setSaving] = useState(false)
  const valid = /^[a-z0-9]{3,20}$/.test(username.trim().toLowerCase()) && name.trim().length > 0 && /^\d{4,6}$/.test(pin)
  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const r = await window.api.createCashier!(username.trim().toLowerCase(), name.trim(), pin)
      if (r.ok) onSaved(); else onError(r.error || 'Could not add cashier.')
    } catch (e: any) { onError(e?.message || 'Could not add cashier.') } finally { setSaving(false) }
  }
  const fieldCls = (f: string) => `w-full min-h-11 px-3 py-2 rounded-[2px] border text-[14px] text-left flex items-center ${field === f ? 'border-[#0D9488] ring-[3px] ring-[#0D9488]/[0.08]' : 'border-[#E4E4E7]'}`
  return (
    <ModalShell title="Add cashier" onClose={onClose}>
      <div>
        <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1">Username (letters/numbers)</label>
        <button type="button" onClick={() => setField('username')} className={fieldCls('username')}>
          {username ? <span className="text-[#18181B] font-mono">{username.toLowerCase()}</span> : <span className="text-[#A1A1AA]">e.g. cashier6</span>}
        </button>
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1">Display name</label>
        <button type="button" onClick={() => setField('name')} className={fieldCls('name')}>
          {name ? <span className="text-[#18181B]">{name}</span> : <span className="text-[#A1A1AA]">e.g. Cashier 6</span>}
        </button>
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1">PIN (4–6 digits)</label>
        <button type="button" onClick={() => setField('pin')} className={fieldCls('pin')}>
          <span className="text-[#18181B] tabular-nums tracking-[0.3em]">{pin ? '•'.repeat(pin.length) : <span className="text-[#A1A1AA] tracking-normal">Tap to set a PIN</span>}</span>
        </button>
      </div>

      {field === 'pin'
        ? <NumberKeypad value={pin} onChange={setPin} onEnter={save} enterLabel={saving ? '…' : 'ADD'} enterTone="teal" enterDisabled={!valid || saving} maxLength={6} />
        : <OnScreenKeyboard value={field === 'username' ? username : name}
            onChange={(v) => field === 'username' ? setUsername(v) : setName(v)}
            onEnter={() => setField(field === 'username' ? 'name' : 'pin')} onClose={onClose} />}
    </ModalShell>
  )
}
