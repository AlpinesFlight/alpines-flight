"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { Aircraft, Reservation, UserLite } from "@/types/models";
import { formatDateTime, formatMoney } from "@/lib/format";
import { isInstructorOrAbove } from "@/lib/permissions";
import { DepartPanel, CompleteFlightPanel } from "./ReservationModal";
import { Plus, X, Phone, Mail, PlaneTakeoff, PlaneLanding, Trash2, ShieldAlert, Compass } from "lucide-react";
import { clsx } from "clsx";

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-navy-100 text-navy-700",
  IN_FLIGHT: "bg-sunset-100 text-sunset-600",
  COMPLETED: "bg-green-100 text-green-700",
};
const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "À venir",
  IN_FLIGHT: "En vol",
  COMPLETED: "Terminé",
};

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function DecouverteView() {
  const { data: session, status: sessionStatus } = useSession();
  const canManage = isInstructorOrAbove(session?.user?.role);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Reservation | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [res, ac, ins] = await Promise.all([
        apiFetch<Reservation[]>("/api/reservations?type=DISCOVERY"),
        apiFetch<Aircraft[]>("/api/aircraft"),
        apiFetch<UserLite[]>("/api/instructors"),
      ]);
      setReservations(res);
      setAircraftList(ac);
      setInstructors(ins);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (canManage) load();
    else setLoading(false);
  }, [sessionStatus, canManage]);

  const { upcoming, inFlight, completed } = useMemo(() => {
    const sorted = [...reservations].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    return {
      upcoming: sorted.filter((r) => r.status === "CONFIRMED"),
      inFlight: sorted.filter((r) => r.status === "IN_FLIGHT"),
      completed: sorted.filter((r) => r.status === "COMPLETED").reverse(),
    };
  }, [reservations]);

  const summary = useMemo(() => {
    const now = new Date();
    const monthCompleted = completed.filter((r) => {
      const d = new Date(r.startTime);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const revenue = monthCompleted.reduce((sum, r) => sum + (r.priceCents ?? 0), 0);
    return { monthCount: monthCompleted.length, revenue, nextOne: upcoming[0] ?? null };
  }, [completed, upcoming]);

  if (!canManage) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md mx-auto mt-8">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé au staff</p>
          <p className="text-sm text-navy-600">
            La gestion des vols découverte/baptême est réservée aux comptes FI, Admin et Gérant.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-end mb-5">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Nouveau vol découverte
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryTile label="Vols ce mois-ci" value={String(summary.monthCount)} />
        <SummaryTile label="Recette encaissée ce mois-ci" value={formatMoney(summary.revenue)} />
        <SummaryTile
          label="Prochain vol"
          value={summary.nextOne ? formatDateTime(summary.nextOne.startTime) : "—"}
        />
      </div>

      {inFlight.length > 0 && (
        <Section title="En vol" icon={PlaneTakeoff}>
          {inFlight.map((r) => (
            <ReservationRow key={r.id} r={r} onClick={() => setDetail(r)} />
          ))}
        </Section>
      )}

      <Section title="À venir" icon={Compass}>
        {!loading && upcoming.length === 0 && (
          <p className="px-5 py-6 text-sm text-navy-600">Aucun vol découverte programmé.</p>
        )}
        {upcoming.map((r) => (
          <ReservationRow key={r.id} r={r} onClick={() => setDetail(r)} />
        ))}
      </Section>

      <Section title="Terminés" icon={PlaneLanding} collapsible>
        {!loading && completed.length === 0 && (
          <p className="px-5 py-6 text-sm text-navy-600">Aucun vol découverte clôturé pour l&apos;instant.</p>
        )}
        {completed.map((r) => (
          <ReservationRow key={r.id} r={r} onClick={() => setDetail(r)} />
        ))}
      </Section>

      {showCreate && (
        <CreateModal
          aircraftList={aircraftList}
          instructors={instructors}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {detail && (
        <DetailModal
          reservation={detail}
          aircraftList={aircraftList}
          instructors={instructors}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-4">
      <p className="text-xl font-bold text-navy-900 leading-tight">{value}</p>
      <p className="text-xs text-navy-600">{label}</p>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  collapsible,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-5">
      <button
        onClick={() => collapsible && setOpen((v) => !v)}
        className={clsx(
          "w-full flex items-center gap-2 px-5 py-3 border-b border-navy-100 text-left",
          !collapsible && "cursor-default"
        )}
      >
        <Icon size={16} className="text-sunset-600" />
        <h2 className="font-semibold text-navy-900">{title}</h2>
      </button>
      {open && <div className="divide-y divide-navy-100">{children}</div>}
    </div>
  );
}

function ReservationRow({ r, onClick }: { r: Reservation; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-navy-50/60 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-900 truncate">
          {r.clientName} · {r.aircraft.registration}
        </p>
        <p className="text-xs text-navy-600">
          {formatDateTime(r.startTime)}
          {r.instructor ? ` · ${r.instructor.firstName} ${r.instructor.lastName}` : ""}
          {r.priceCents != null ? ` · ${formatMoney(r.priceCents)}` : ""}
        </p>
      </div>
      <span className={clsx("shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap", STATUS_STYLE[r.status])}>
        {STATUS_LABEL[r.status] ?? r.status}
      </span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-navy-600">{label}</span>
      {children}
    </label>
  );
}

function CreateModal({
  aircraftList,
  instructors,
  onClose,
  onCreated,
}: {
  aircraftList: Aircraft[];
  instructors: UserLite[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const now = new Date();
  const in1h = new Date(now.getTime() + 3_600_000);
  const [aircraftId, setAircraftId] = useState(aircraftList[0]?.id ?? "");
  const [instructorId, setInstructorId] = useState("");
  const [start, setStart] = useState(toLocalInput(now));
  const [end, setEnd] = useState(toLocalInput(in1h));
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          aircraftId,
          instructorId: instructorId || null,
          type: "DISCOVERY",
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
          clientName,
          clientPhone: clientPhone || null,
          clientEmail: clientEmail || null,
          priceCents: price ? Math.round(parseFloat(price) * 100) : null,
          notes: notes || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Nouveau vol découverte</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <Field label="Nom du client">
            <input required value={clientName} onChange={(e) => setClientName(e.target.value)} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Téléphone (optionnel)">
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="input" />
            </Field>
            <Field label="Email (optionnel)">
              <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début">
              <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className="input" />
            </Field>
            <Field label="Fin">
              <input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Avion">
            <select required value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="input">
              {aircraftList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration} — {a.type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instructeur / pilote (optionnel)">
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input">
              <option value="">—</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.firstName} {i.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forfait (€, optionnel)">
            <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
          </Field>
          <Field label="Notes (optionnel)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16" />
          </Field>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Création..." : "Créer la réservation"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DetailModal({
  reservation,
  aircraftList,
  instructors,
  onClose,
  onChanged,
}: {
  reservation: Reservation;
  aircraftList: Aircraft[];
  instructors: UserLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [panel, setPanel] = useState<"view" | "edit" | "depart" | "complete">("view");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCancel() {
    if (!window.confirm(`Annuler le vol découverte de ${reservation.clientName} ?`)) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            {panel === "depart" ? "Valider le départ" : panel === "complete" ? "Compte-rendu de vol" : panel === "edit" ? "Modifier" : reservation.clientName}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {panel === "depart" && (
          <DepartPanel reservation={reservation} onCancel={() => setPanel("view")} onDeparted={onChanged} />
        )}

        {panel === "complete" && (
          <CompleteFlightPanel
            reservation={reservation}
            instructors={instructors}
            programs={[]}
            onCancel={() => setPanel("view")}
            onCompleted={onChanged}
          />
        )}

        {panel === "edit" && (
          <EditForm
            reservation={reservation}
            aircraftList={aircraftList}
            instructors={instructors}
            onCancel={() => setPanel("view")}
            onSaved={onChanged}
          />
        )}

        {panel === "view" && (
          <div className="p-5 flex flex-col gap-4">
            <span className={clsx("w-fit text-[11px] font-semibold px-2 py-1 rounded-full", STATUS_STYLE[reservation.status])}>
              {STATUS_LABEL[reservation.status] ?? reservation.status}
            </span>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Avion">
                <p className="text-navy-800">{reservation.aircraft.registration}</p>
              </Field>
              <Field label="Instructeur / pilote">
                <p className="text-navy-800">
                  {reservation.instructor ? `${reservation.instructor.firstName} ${reservation.instructor.lastName}` : "—"}
                </p>
              </Field>
              <Field label="Départ">
                <p className="text-navy-800">{formatDateTime(reservation.startTime)}</p>
              </Field>
              <Field label="Fin">
                <p className="text-navy-800">{formatDateTime(reservation.endTime)}</p>
              </Field>
              {reservation.priceCents != null && (
                <Field label="Forfait">
                  <p className="text-navy-800">{formatMoney(reservation.priceCents)}</p>
                </Field>
              )}
            </div>
            <div className="rounded-lg bg-navy-50 px-3 py-2.5 text-sm flex flex-col gap-1">
              {reservation.clientPhone && (
                <p className="flex items-center gap-1.5 text-navy-700">
                  <Phone size={13} /> {reservation.clientPhone}
                </p>
              )}
              {reservation.clientEmail && (
                <p className="flex items-center gap-1.5 text-navy-700">
                  <Mail size={13} /> {reservation.clientEmail}
                </p>
              )}
              {!reservation.clientPhone && !reservation.clientEmail && (
                <p className="text-navy-500">Aucune coordonnée renseignée.</p>
              )}
            </div>
            {reservation.notes && <p className="text-sm text-navy-600">{reservation.notes}</p>}

            {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex items-center justify-between gap-2 border-t border-navy-100 pt-3">
              {reservation.status === "CONFIRMED" ? (
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} /> Annuler
                </button>
              ) : (
                <span />
              )}
              {reservation.status !== "COMPLETED" && (
                <button
                  onClick={() => setPanel("edit")}
                  className="text-sm text-navy-600 hover:text-navy-900 font-medium"
                >
                  Modifier
                </button>
              )}
            </div>

            {reservation.status === "CONFIRMED" && (
              <button
                onClick={() => setPanel("depart")}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 font-semibold px-3.5 py-2 text-sm transition-colors"
              >
                <PlaneTakeoff size={16} /> Valider le départ
              </button>
            )}
            {reservation.status === "IN_FLIGHT" && (
              <button
                onClick={() => setPanel("complete")}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 font-semibold px-3.5 py-2 text-sm transition-colors"
              >
                <PlaneLanding size={16} /> Valider le retour
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditForm({
  reservation,
  aircraftList,
  instructors,
  onCancel,
  onSaved,
}: {
  reservation: Reservation;
  aircraftList: Aircraft[];
  instructors: UserLite[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [aircraftId, setAircraftId] = useState(reservation.aircraftId);
  const [instructorId, setInstructorId] = useState(reservation.instructorId ?? "");
  const [start, setStart] = useState(toLocalInput(new Date(reservation.startTime)));
  const [end, setEnd] = useState(toLocalInput(new Date(reservation.endTime)));
  const [clientName, setClientName] = useState(reservation.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(reservation.clientPhone ?? "");
  const [clientEmail, setClientEmail] = useState(reservation.clientEmail ?? "");
  const [price, setPrice] = useState(reservation.priceCents != null ? String(reservation.priceCents / 100) : "");
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          aircraftId,
          instructorId: instructorId || null,
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
          clientName,
          clientPhone: clientPhone || null,
          clientEmail: clientEmail || null,
          priceCents: price ? Math.round(parseFloat(price) * 100) : null,
          notes: notes || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
      <Field label="Nom du client">
        <input required value={clientName} onChange={(e) => setClientName(e.target.value)} className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Téléphone (optionnel)">
          <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="input" />
        </Field>
        <Field label="Email (optionnel)">
          <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début">
          <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className="input" />
        </Field>
        <Field label="Fin">
          <input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
        </Field>
      </div>
      <Field label="Avion">
        <select required value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="input">
          {aircraftList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.registration} — {a.type}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Instructeur / pilote (optionnel)">
        <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input">
          <option value="">—</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.firstName} {i.lastName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Forfait (€, optionnel)">
        <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
      </Field>
      <Field label="Notes (optionnel)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16" />
      </Field>
      {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onCancel} className="text-sm text-navy-600 hover:text-navy-900">
          Retour
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
