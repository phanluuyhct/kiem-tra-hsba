// Edge function: quản trị app HSBA tạo tài khoản / đặt lại mật khẩu cho cán bộ.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Chưa đăng nhập" }, 401);
    const { data: laQT } = await caller.rpc("hsba_quan_tri");
    if (!laQT) return json({ error: "Chỉ quản trị app mới được làm việc này" }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json();

    if (body.action === "tao") {
      const email = String(body.email || "").trim().toLowerCase();
      const ho_ten = String(body.ho_ten || "").trim();
      const vai_tro = body.vai_tro === "quan_tri" ? "quan_tri" : "can_bo";
      const mat_khau = String(body.mat_khau || "");
      if (!email || !ho_ten) return json({ error: "Thiếu họ tên hoặc email" }, 400);
      let { data: uid } = await admin.rpc("hsba_tim_user", { p_email: email });
      let moi = false;
      if (!uid) {
        if (mat_khau.length < 8) return json({ error: "Mật khẩu tạm phải có ít nhất 8 ký tự" }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email, password: mat_khau, email_confirm: true,
          user_metadata: { app: "hsba", full_name: ho_ten },
        });
        if (error) return json({ error: error.message }, 400);
        uid = data.user.id; moi = true;
      }
      const { error } = await admin.from("hsba_tai_khoan").upsert(
        { user_id: uid, ho_ten, email, vai_tro, hoat_dong: true, tao_boi: user.id },
        { onConflict: "user_id" },
      );
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, moi });
    }

    if (body.action === "doi_mat_khau") {
      const uid = String(body.user_id || "");
      const mat_khau = String(body.mat_khau || "");
      if (mat_khau.length < 8) return json({ error: "Mật khẩu phải có ít nhất 8 ký tự" }, 400);
      const { data: tk } = await admin.from("hsba_tai_khoan").select("user_id").eq("user_id", uid).maybeSingle();
      if (!tk) return json({ error: "Không có tài khoản này trong app" }, 404);
      const { data: u } = await admin.auth.admin.getUserById(uid);
      if (u?.user?.user_metadata?.app !== "hsba")
        return json({ error: "Tài khoản này dùng chung với app khác; người dùng tự đổi mật khẩu bằng 'Quên mật khẩu?'" }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password: mat_khau });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: "Yêu cầu không hợp lệ" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
