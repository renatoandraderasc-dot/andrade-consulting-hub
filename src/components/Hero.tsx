import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 bg-background/70" />

      <div className="relative z-10 container mx-auto px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-primary font-body tracking-[0.3em] uppercase text-sm mb-6"
        >
          Excelência em Consultoria Empresarial
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-display text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight"
        >
          Andrade
          <br />
          <span className="text-gradient-gold">Consultoria</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 font-body"
        >
          Transformamos desafios em oportunidades. Estratégia, gestão e
          resultados para o crescimento sustentável do seu negócio.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="#contato"
            className="bg-gradient-gold text-primary-foreground font-body font-semibold px-8 py-4 rounded-lg hover:opacity-90 transition-opacity text-lg"
          >
            Agende uma Conversa
          </a>
          <a
            href="#servicos"
            className="border border-primary/30 text-foreground font-body font-medium px-8 py-4 rounded-lg hover:bg-primary/10 transition-colors text-lg"
          >
            Nossos Serviços
          </a>
        </motion.div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-6 h-10 border-2 border-primary/30 rounded-full flex items-start justify-center p-2"
        >
          <div className="w-1 h-2 bg-primary rounded-full" />
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
