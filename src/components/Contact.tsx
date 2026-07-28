import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";

const Contact = () => {
  const { content } = useSiteContent();
  const c = content.contact;

  return (
    <section id="contato" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <p className="text-primary font-body tracking-[0.2em] uppercase text-sm mb-4">{c.eyebrow}</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
            {c.titlePrefix} <span className="text-gradient-gold">{c.titleAccent}</span> {c.titleSuffix}
          </h2>
          <p className="text-muted-foreground font-body text-lg mb-12">{c.body}</p>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Phone, label: c.phone },
              { icon: Mail, label: c.email },
              { icon: MapPin, label: c.address },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="p-6 rounded-xl bg-card border border-border"
              >
                <item.icon className="w-6 h-6 text-primary mx-auto mb-3" />
                <p className="text-foreground font-body text-sm">{item.label}</p>
              </motion.div>
            ))}
          </div>

          <a
            href={`https://wa.me/${c.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-gradient-gold text-primary-foreground font-body font-semibold px-10 py-4 rounded-lg hover:opacity-90 transition-opacity text-lg"
          >
            {c.ctaWhatsapp}
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default Contact;
