import { motion } from "framer-motion";
import { TrendingUp, Users, Target, BarChart3 } from "lucide-react";

const services = [
  {
    icon: Target,
    title: "Planejamento Estratégico",
    description:
      "Definimos metas claras e caminhos eficientes para posicionar sua empresa à frente da concorrência.",
  },
  {
    icon: BarChart3,
    title: "Gestão Financeira",
    description:
      "Otimização de custos, análise de viabilidade e estruturação financeira para decisões mais inteligentes.",
  },
  {
    icon: Users,
    title: "Gestão de Pessoas",
    description:
      "Desenvolvimento de lideranças, cultura organizacional e processos de RH alinhados aos resultados.",
  },
  {
    icon: TrendingUp,
    title: "Crescimento & Vendas",
    description:
      "Estratégias comerciais, funis de vendas e processos escaláveis para impulsionar sua receita.",
  },
];

const Services = () => {
  return (
    <section id="servicos" className="py-24 bg-card">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-primary font-body tracking-[0.2em] uppercase text-sm mb-4">
            O que fazemos
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-bold">
            Nossos <span className="text-gradient-gold">Serviços</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group p-8 rounded-xl bg-background border border-border hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <service.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                {service.title}
              </h3>
              <p className="text-muted-foreground font-body leading-relaxed text-sm">
                {service.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
