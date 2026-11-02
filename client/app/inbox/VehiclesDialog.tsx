"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { showToast } from "@/lib/toasts";
import {
  type Vehicle,
  type VehicleCustomer,
  VEHICLES_EVENT,
  addVehicle,
  deleteVehicle,
  listVehicles,
  searchVehicleCustomers,
  vehicleTitle,
} from "@/lib/vehicles";

// The TyresCart car (sized by width only; the height follows its 2.8:1 ratio)
export const CarIcon = ({
  className = "w-[1.375rem]",
}: {
  className?: string;
}) => (
  <svg
    className={`h-auto shrink-0 ${className}`}
    viewBox="0 0 47.747 16.977"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      transform="translate(122.615 -135.806)"
      d="M-122.615,146.25a14.294,14.294,0,0,0,.9,1.807,1.609,1.609,0,0,0,.935.518c1.073.245,2.161.424,3.313.642a4.4,4.4,0,0,1,2.574-3.96,4.107,4.107,0,0,1,2.686-.294,4.432,4.432,0,0,1,3.413,4.935l21.435.432a4.315,4.315,0,0,1,1.162-4.224,4.061,4.061,0,0,1,3.118-1.236,4.36,4.36,0,0,1,4.163,5.139c.687-.113,1.356-.194,2.011-.338,1.472-.323,1.693-.616,1.987-2.158a5.746,5.746,0,0,0-.342-2.547,2.327,2.327,0,0,0-1.6-1.7,39.349,39.349,0,0,0-7.593-2.017,16.658,16.658,0,0,1-3.88-1.389c-1.793-.78-3.566-1.607-5.351-2.407a21.266,21.266,0,0,0-9.744-1.617,33.618,33.618,0,0,0-11.928,2.885,20.127,20.127,0,0,1-5.156,1.381c-1.089.153-1.255.357-1.256,1.444,0,.358-.012.716,0,1.073a2.047,2.047,0,0,1-.454,1.677,2.842,2.842,0,0,0-.391.931Zm30.034-4.853a.274.274,0,0,1-.12.014c-2.485-.069-4.97-.144-7.455-.2-.27-.007-.33-.139-.381-.359-.23-.982-.476-1.96-.714-2.939-.071-.291-.135-.584-.222-.962,3.475.284,6.78.76,9.465,2.868Zm-9.58-.407a.745.745,0,0,1-.153.049c-2.3-.068-4.594-.135-6.89-.218a.451.451,0,0,1-.317-.243,1.572,1.572,0,0,1,.174-1.881,8.174,8.174,0,0,0,.455-.7.938.938,0,0,1,.418-.325,17.885,17.885,0,0,1,5.381-.687.411.411,0,0,1,.315.232C-102.558,138.468-102.363,139.723-102.161,140.989Zm-11.361-.195a1.036,1.036,0,0,1,.612-1.247c.563-.291,1.137-.561,1.714-.823.506-.23,1.022-.436,1.534-.653-.557.9-1.154,1.725-1.762,2.543a.451.451,0,0,1-.3.172C-112.325,140.8-112.928,140.794-113.522,140.794Z"
    />
    <path
      transform="translate(-503.07 -304.356)"
      d="M512.565,314.14a3.6,3.6,0,1,0,3.6,3.624A3.629,3.629,0,0,0,512.565,314.14Zm.312,1.314,1.1.473c-.269.253-.451.444-.653.61-.235.192-.407.1-.443-.176A8.107,8.107,0,0,1,512.877,315.454Zm0,4.553c0-.385-.021-.647.006-.906s.2-.346.412-.185.426.372.718.632Zm-2.582-2.585.5-1.186c.23.3.4.5.543.717.06.089.121.236.086.313a.392.392,0,0,1-.29.149C510.886,317.437,510.64,317.422,510.295,317.422Zm.463,1.772-.445-1.135c.352,0,.615-.021.874.005.3.03.368.2.177.436C511.2,318.705,511.02,318.9,510.757,319.194Zm4.1-1.678-1.151-.247c.2-.267.4-.534.6-.8.012-.015.057,0,.144-.009Zm-.416,1.52-.189.072c-.151-.194-.314-.38-.449-.584a.47.47,0,0,1-.082-.321c.014-.063.158-.13.248-.137.259-.018.52-.006.861-.006Zm-2.194-3.58a7.38,7.38,0,0,1-.008.906c-.039.276-.2.369-.445.165-.2-.165-.407-.324-.714-.568Zm-1.139,4.083c.3-.255.48-.424.679-.567a.428.428,0,0,1,.309-.082c.067.017.138.154.145.242.019.255.007.513.007.871Z"
    />
    <path
      transform="translate(72.415 -304.356)"
      d="M-32.965,314.14a3.616,3.616,0,0,0-3.619,3.614,3.631,3.631,0,0,0,3.609,3.579,3.607,3.607,0,0,0,3.585-3.545A3.6,3.6,0,0,0-32.965,314.14Zm.3,1.326,1.144.474c-.3.256-.5.447-.72.612s-.389.1-.418-.169S-32.665,315.835-32.665,315.466Zm1.5.812.453,1.144c-.355,0-.617.017-.876,0-.306-.025-.363-.2-.185-.434C-31.619,316.775-31.436,316.585-31.17,316.278Zm.472,1.782-.484,1.09c-.26-.282-.452-.465-.612-.673s-.1-.386.177-.413S-31.093,318.06-30.7,318.06Zm-2.6-2.6c0,.355.012.614-.007.871-.006.088-.074.225-.14.244a.419.419,0,0,1-.314-.071c-.208-.15-.4-.328-.682-.57Zm-1.483.8c.25.3.428.492.58.7a.415.415,0,0,1,.067.313c-.019.066-.156.131-.244.138-.258.018-.518.007-.863.007Zm.011,2.963-.474-1.164c.356,0,.619-.018.878,0,.287.025.382.18.194.428C-34.341,318.712-34.523,318.919-34.774,319.224Zm2.107.794c0-.357-.014-.6.007-.846a.379.379,0,0,1,.15-.279.394.394,0,0,1,.308.076c.213.145.409.314.708.55Zm-1.762-.474c.29-.253.468-.426.666-.572a.429.429,0,0,1,.312-.081c.065.016.136.154.142.242.019.258.007.519.007.871Z"
    />
  </svg>
);

const customerLabel = (c: VehicleCustomer) =>
  c.name ? `${c.name} · +${c.waId}` : `+${c.waId}`;

// Today in the viewer's own time zone, for the date pickers' max
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Form = {
  customer: VehicleCustomer | null;
  plateNumber: string;
  year: string;
  make: string;
  model: string;
  registrationDate: string;
  lastServiceDate: string;
  tireSize1: string;
  tireSize2: string;
};
type Field = keyof Form;

function validate(f: Form): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!f.customer) errors.customer = "Choose a CRM customer";
  if (!f.plateNumber.trim()) errors.plateNumber = "Enter the plate number";
  if (!f.make.trim()) errors.make = "Enter the make";
  if (!f.model.trim()) errors.model = "Enter the model";
  if (!f.year.trim()) errors.year = "Enter the year";
  else if (!/^\d{4}$/.test(f.year.trim())) errors.year = "Enter a 4-digit year";
  if (!f.tireSize1.trim()) errors.tireSize1 = "Enter tire size 1";
  return errors;
}

// "Add vehicle" (formOnly: straight to the form for this customer) or "Vehicles" (the customer's list + Add vehicle)
export function VehiclesDialog({
  customer,
  onClose,
  formOnly = false,
}: {
  customer: VehicleCustomer;
  onClose: () => void;
  formOnly?: boolean;
}) {
  const [adding, setAdding] = useState(formOnly);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState("");
  const titleId = useId();

  const load = useCallback(
    () =>
      listVehicles(customer.id)
        .then((v) => {
          setVehicles(v);
          setListError("");
        })
        .catch((e) => setListError((e as Error).message)),
    [customer.id],
  );
  useEffect(() => {
    if (formOnly) return;
    load();
    const onChanged = (e: Event) =>
      (e as CustomEvent<{ contactId: string }>).detail?.contactId ===
        customer.id && load();
    window.addEventListener(VEHICLES_EVENT, onChanged);
    return () => window.removeEventListener(VEHICLES_EVENT, onChanged);
  }, [formOnly, load, customer.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !e.defaultPrevented && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-shadow/40 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <CarIcon className="w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[15px] font-bold leading-tight text-ink"
            >
              {adding ? "Add vehicle" : "Vehicles"}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {customer.name || `+${customer.waId}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-body-soft hover:bg-surface-muted disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {adding ? (
          <VehicleForm
            initialCustomer={customer}
            fixedCustomer={formOnly}
            busy={busy}
            setBusy={setBusy}
            onCancel={() => (formOnly ? onClose() : setAdding(false))}
            onSaved={() => {
              showToast(`vehicle:${Date.now()}`, "", "Vehicle added");
              if (formOnly) onClose();
              else {
                setAdding(false);
                load();
              }
            }}
          />
        ) : (
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            {listError && (
              <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                {listError}
              </p>
            )}
            {vehicles === null ? (
              !listError && (
                <p className="py-6 text-center text-xs text-muted">
                  Loading vehicles…
                </p>
              )
            ) : vehicles.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                No vehicles yet.
              </p>
            ) : (
              <ul className="divide-y divide-line-soft rounded-xl border border-line">
                {vehicles.map((v) => (
                  <VehicleRow key={v.id} vehicle={v} onDeleted={load} />
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover"
              >
                + Add vehicle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// One vehicle in the list; Delete asks "Delete?" first (shown on hover / focus)
function VehicleRow({
  vehicle: v,
  onDeleted,
}: {
  vehicle: Vehicle;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteVehicle(v.id);
      showToast(`vehicle:${Date.now()}`, "", "Vehicle deleted");
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setConfirming(false);
    }
  }
  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">
            {vehicleTitle(v)}
          </span>
          <span className="rounded border border-line bg-surface-strong px-1.5 py-px font-mono text-[11px] font-semibold tracking-wide text-body">
            {v.plateNumber}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-body-soft">
          Tires: {v.tireSize1}
          {v.tireSize2 && ` · ${v.tireSize2}`}
        </p>
        {(v.registrationDate || v.lastServiceDate) && (
          <p className="mt-0.5 text-[11px] text-muted">
            {[
              v.registrationDate && `Registered ${v.registrationDate}`,
              v.lastServiceDate &&
                `Last purchase / service ${v.lastServiceDate}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      </div>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-md bg-danger px-2.5 py-1 text-[11px] font-semibold text-on-primary disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-1 text-[11px] text-body-soft hover:bg-surface-muted"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${vehicleTitle(v)} (${v.plateNumber})`}
          title="Delete"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-body-soft opacity-0 transition group-hover:opacity-100 hover:bg-surface-muted hover:text-danger focus:opacity-100"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
          </svg>
        </button>
      )}
    </li>
  );
}

function VehicleForm({
  initialCustomer,
  fixedCustomer,
  busy,
  setBusy,
  onCancel,
  onSaved,
}: {
  initialCustomer: VehicleCustomer;
  fixedCustomer: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>({
    customer: initialCustomer,
    plateNumber: "",
    year: "",
    make: "",
    model: "",
    registrationDate: "",
    lastServiceDate: "",
    tireSize1: "",
    tireSize2: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const errors = submitted ? validate(form) : {};
  const today = localToday();
  const set = <K extends Field>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (busy || Object.keys(validate(form)).length) return;
    setBusy(true);
    setServerError("");
    try {
      await addVehicle({
        contactId: form.customer!.id,
        plateNumber: form.plateNumber.trim().toUpperCase(),
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year.trim()),
        registrationDate: form.registrationDate || null,
        lastServiceDate: form.lastServiceDate || null,
        tireSize1: form.tireSize1.trim(),
        tireSize2: form.tireSize2.trim() || null,
      });
      setBusy(false);
      onSaved();
    } catch (err) {
      setServerError((err as Error).message);
      setBusy(false);
    }
  }

  const input = (bad: boolean) =>
    `h-[38px] w-full rounded-lg border bg-surface px-3 text-[13px] text-ink outline-hidden placeholder:text-faint focus:ring-1 ${bad ? "border-danger focus:border-danger focus:ring-danger" : "border-line focus:border-primary focus:ring-primary"}`;
  const label = (id: string, text: string, required: boolean) => (
    <label
      htmlFor={id}
      className="mb-1.5 block text-[11px] font-semibold text-body-soft"
    >
      {text}
      {required ? (
        <span className="text-danger"> *</span>
      ) : (
        <span className="font-normal text-faint"> (optional)</span>
      )}
    </label>
  );
  const problem = (k: Field) =>
    errors[k] && <p className="mt-1 text-[11px] text-danger">{errors[k]}</p>;
  const textField = (
    k: Exclude<Field, "customer">,
    text: string,
    required: boolean,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      {label(`vehicle-${k}`, text, required)}
      <input
        id={`vehicle-${k}`}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={!!errors[k]}
        className={input(!!errors[k])}
        {...extra}
      />
      {problem(k)}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {label("vehicle-customer", "CRM Customer", true)}
            {fixedCustomer ? (
              <p
                id="vehicle-customer"
                className="flex h-[38px] items-center rounded-lg border border-line bg-surface-muted px-3 text-[13px] text-ink"
              >
                {customerLabel(initialCustomer)}
              </p>
            ) : (
              <CustomerPicker
                value={form.customer}
                onChange={(c) => set("customer", c)}
                invalid={!!errors.customer}
              />
            )}
            {problem("customer")}
          </div>
          {textField("plateNumber", "Plate Number", true, {
            maxLength: 20,
            placeholder: "e.g. A 12345",
            autoFocus: true,
            style: { textTransform: form.plateNumber ? "uppercase" : "none" },
          })}
          {textField("year", "Year", true, {
            inputMode: "numeric",
            maxLength: 4,
            placeholder: "e.g. 2022",
            onChange: (e) =>
              set("year", e.target.value.replace(/\D/g, "").slice(0, 4)),
          })}
          {textField("make", "Make", true, {
            maxLength: 60,
            placeholder: "e.g. Toyota",
          })}
          {textField("model", "Model", true, {
            maxLength: 60,
            placeholder: "e.g. Land Cruiser",
          })}
          {textField("registrationDate", "Registration Date", false, {
            type: "date",
            max: today,
          })}
          {textField("lastServiceDate", "Last Purchase / Service Date", false, {
            type: "date",
            max: today,
          })}
          {textField("tireSize1", "Tire Size 1", true, {
            maxLength: 30,
            placeholder: "e.g. 265/65 R17",
          })}
          {textField("tireSize2", "Tire Size 2", false, {
            maxLength: 30,
            placeholder: "Rear, if different",
          })}
        </div>
        {serverError && (
          <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {serverError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-soft px-5 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-body hover:bg-surface-strong disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add vehicle"}
        </button>
      </div>
    </form>
  );
}

// Searchable CRM customer (name or WhatsApp number), 250 ms after typing; ↑ ↓ Enter Esc
function CustomerPicker({
  value,
  onChange,
  invalid,
}: {
  value: VehicleCustomer | null;
  onChange: (c: VehicleCustomer | null) => void;
  invalid: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<VehicleCustomer[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      searchVehicleCustomers(query)
        .then((r) => {
          setResults(r);
          setActive(0);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (c: VehicleCustomer) => {
    onChange(c);
    setOpen(false);
    setQuery("");
  };
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === "Escape" && open) {
      // Close only the list, not the whole dialog
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    }
  }

  const border = invalid
    ? "border-danger"
    : "border-line focus-within:border-primary";
  return (
    <div ref={ref} className="relative">
      <input
        id="vehicle-customer"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        value={open ? query : value ? customerLabel(value) : ""}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search by name or WhatsApp number"
        className={`h-[38px] w-full rounded-lg border bg-surface px-3 text-[13px] text-ink outline-hidden placeholder:text-faint ${border}`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl"
        >
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={`flex w-full flex-col px-3 py-2 text-left ${i === active ? "bg-surface-muted" : ""}`}
              >
                <span className="truncate text-[13px] text-ink">
                  {c.name || `+${c.waId}`}
                </span>
                {c.name && (
                  <span className="text-[11px] text-muted">+{c.waId}</span>
                )}
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="px-3 py-2 text-xs text-muted">
              {loading ? "Searching…" : "No customer matches."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
