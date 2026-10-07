/* Taste of Recovery app — backend settings.
   The URL and publishable key are meant to be public: the database's access
   rules (supabase/schema.sql) are what protect the data. Never put the
   secret / service_role key here.

   signIn: "anonymous" = name + phone, no text code (until Twilio is connected)
           "phone"     = a 6-digit code is texted to the guest
   Add ?demo=1 to the app URL to use the on-device demo instead (the device
   remembers it); ?demo=0 switches back. */

export const CONFIG = {
  supabaseUrl: "https://ekqrrhxfeacjlfujvkgf.supabase.co",
  supabaseKey: "sb_publishable_brnHl-6XXZpenE3pYvU31A_1tkUBVhJ",
  signIn: "anonymous",
};
