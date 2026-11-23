import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../api/client';
import { ClubActionKind, ClubTable, ClubTableResponse, clubAction, fetchMyClubTable, leaveClub, startPrivateClub } from '../../api/backend';

export function clubErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

/**
 * The player's table, kept fresh. The server has no push channel, so the app polls (about once a second while a hand is on) and
 * every answer carries the server's clock, which is how the turn timers are kept in step with it. Moves are sent with the turn
 * they were made for, so a tap that arrives after the turn has moved on is turned away instead of acting for the wrong turn.
 */
export function useClubTable() {
  const [table, setTable] = useState<ClubTable | null>(null);
  const [checked, setChecked] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const tableRef = useRef<ClubTable | null>(null);
  const offsetRef = useRef(0);
  const aliveRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /** Takes an answer of the server; one that is older than what is shown (it arrived late) is ignored. */
  const apply = useCallback((res: ClubTableResponse) => {
    if (!aliveRef.current) return;
    offsetRef.current = res.now - Date.now();
    if (res.unchanged) return;
    const prev = tableRef.current;
    const next = res.table;
    if (next && prev && next.id === prev.id && next.version < prev.version) return;
    tableRef.current = next;
    setTable(next);
  }, []);

  // The first look: is the player already sitting somewhere (the app was closed in the middle of a hand)?
  useEffect(() => {
    let cancelled = false;
    fetchMyClubTable()
      .then((res) => {
        if (!cancelled) apply(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const tableId = table?.id ?? null;
  useEffect(() => {
    if (!tableId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (stop) return;
      try {
        if (!busyRef.current) apply(await fetchMyClubTable(tableRef.current?.version));
        if (!stop) setOffline(false);
      } catch {
        if (!stop) setOffline(true);
      }
      if (stop) return;
      const cur = tableRef.current;
      const live = cur?.phase === 'PLAYING' && cur.hand && !cur.hand.over;
      timer = setTimeout(loop, live ? 750 : cur?.phase === 'WAITING' ? 1500 : 900);
    };
    timer = setTimeout(loop, 600);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [tableId, apply]);

  /** What a move would be at the table's own clock: the server's time now. */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  const act = useCallback(
    async (kind: ClubActionKind): Promise<string | null> => {
      const t = tableRef.current;
      if (!t || !t.hand) return 'There is no hand to play.';
      busyRef.current = true;
      setBusy(true);
      try {
        apply(await clubAction(kind, t.hand.turnNo));
        return null;
      } catch (err) {
        // The table may have moved on while the finger was on its way: look again at once.
        fetchMyClubTable()
          .then(apply)
          .catch(() => {});
        return clubErrorMessage(err);
      } finally {
        busyRef.current = false;
        if (aliveRef.current) setBusy(false);
      }
    },
    [apply]
  );

  const start = useCallback(async (): Promise<string | null> => {
    try {
      apply(await startPrivateClub());
      return null;
    } catch (err) {
      return clubErrorMessage(err);
    }
  }, [apply]);

  const leave = useCallback(async (): Promise<string | null> => {
    try {
      await leaveClub();
      tableRef.current = null;
      if (aliveRef.current) setTable(null);
      return null;
    } catch (err) {
      return clubErrorMessage(err);
    }
  }, []);

  return { table, checked, offline, busy, apply, act, start, leave, serverNow };
}
