"use client";
import { useActionState } from "react";
import { saveMember, type FormState } from "@/app/actions";

type M = { id: number; name: string; email: string | null; is_admin: boolean };

export function MemberForm({ member }: { member?: M }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMember, null);
  const k = member?.id ?? "new";
  return (
    <form action={action} key={state?.ok && !member ? state.ok : undefined}>
      {member && <input type="hidden" name="id" value={member.id} />}
      <div className="grid2">
        <div className="field">
          <label htmlFor={`mn${k}`}>Name</label>
          <input id={`mn${k}`} name="name" defaultValue={member?.name} maxLength={60} required />
        </div>
        <div className="field">
          <label htmlFor={`me${k}`}>Email (to sign in)</label>
          <input id={`me${k}`} name="email" type="email" defaultValue={member?.email ?? ""} placeholder="optional" />
        </div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input type="checkbox" name="isAdmin" defaultChecked={member?.is_admin} /> Admin (can manage people)
      </label>
      <button type="submit" className="sm" disabled={pending}>{pending ? "Saving…" : member ? "Save" : "Add person"}</button>
      {state?.error && <p className="msg err">{state.error}</p>}
      {state?.ok && <p className="msg ok">{state.ok}</p>}
    </form>
  );
}
