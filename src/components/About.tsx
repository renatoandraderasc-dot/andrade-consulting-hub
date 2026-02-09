import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

const differentials = [
  "Metodologia própria com foco em resultados mensuráveis",
  "Equipe multidisciplinar com experiência no mercado",
  "Acompanhamento contínuo e relatórios de progresso",
  "Soluções personalizadas para cada tipo de negócio",
];

const About = () => {
  return (
    <section id="sobre" className="py-24 bg-card">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-primary font-body tracking-[0.2em] uppercase text-sm mb-4">
              Quem somos
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Parceiros do seu{" "}
              <span className="text-gradient-gold">crescimento</span>
            </h2>
            <p className="text-muted-foreground font-body leading-relaxed mb-8 text-lg">
              A Andrade Consultoria nasceu da paixão por transformar negócios.
              Com mais de uma década de atuação, ajudamos empresas de todos os
              portes a alcançar seu verdadeiro potencial através de estratégias
              inteligentes e execução impecável.
            </p>

            <div className="space-y-4">
              {differentials.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-foreground font-body">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="aspect-square rounded-2xl bg-secondary border border-border overflow-hidden flex items-center justify-center">
              <div className="text-center p-12">
                <p className="font-display text-6xl md:text-7xl font-bold text-gradient-gold mb-4">
                  AC
                </p>
                <div className="w-16 h-0.5 bg-gradient-gold mx-auto mb-4" />
                <p className="text-muted-foreground font-body tracking-widest uppercase text-xs">
                  Excelência em Consultoria
                </p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 w-32 h-32 border-2 border-primary/20 rounded-2xl -z-10" />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default About;
