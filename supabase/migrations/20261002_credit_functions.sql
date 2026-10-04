-- Reserva y reembolso atómicos de créditos (anti-TOCTOU).
-- La app NO debe leer el saldo y luego escribirlo: dos solicitudes simultáneas verían el mismo
-- saldo. Aquí el descuento es un único UPDATE condicional y el reembolso es relativo (+1).

-- Descuenta 1 crédito si hay saldo. Devuelve el nuevo saldo, o NULL si no hay saldo / suscripción.
create or replace function public.reserve_credit(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.subscriptions
     set creditos_disponibles = creditos_disponibles - 1
   where user_id = p_user_id
     and creditos_disponibles > 0
  returning creditos_disponibles;
$$;

-- Devuelve 1 crédito (reembolso tras un fallo). Devuelve el nuevo saldo, o NULL si no hay suscripción.
create or replace function public.refund_credit(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.subscriptions
     set creditos_disponibles = creditos_disponibles + 1
   where user_id = p_user_id
  returning creditos_disponibles;
$$;

-- Solo el backend (service_role) puede mover créditos; un usuario con su JWT no debe poder
-- regalarse saldo llamando a la RPC desde el navegador.
revoke all on function public.reserve_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid) from public, anon, authenticated;
grant execute on function public.reserve_credit(uuid) to service_role;
grant execute on function public.refund_credit(uuid) to service_role;
