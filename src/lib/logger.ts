import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "CRITICAL";

interface LogOptions {
  details?: any;
  context?: string;
  silent?: boolean; // If true, won't show a toast
  userId?: string;
}

class Logger {
  private async saveLog(level: LogLevel, message: string, options?: LogOptions) {
    const { details, context, userId } = options || {};
    
    // Console output for developers
    const consoleMethod = level === "ERROR" || level === "CRITICAL" ? "error" : level === "WARN" ? "warn" : "log";
    console[consoleMethod](`[${level}] ${context ? `(${context}) ` : ""}${message}`, details || "");

    try {
      // Save to Supabase for auditing/alerts
      const { error } = await supabase.from("system_logs").insert({
        level,
        message,
        details,
        context,
        user_id: userId,
      });

      if (error) {
        console.error("Failed to save system log:", error);
      }
    } catch (e) {
      console.error("Error in logger saveLog:", e);
    }
  }

  async info(message: string, options?: LogOptions) {
    await this.saveLog("INFO", message, options);
  }

  async warn(message: string, options?: LogOptions) {
    await this.saveLog("WARN", message, options);
    if (!options?.silent) {
      toast.warning(message);
    }
  }

  async error(message: string, options?: LogOptions) {
    await this.saveLog("ERROR", message, options);
    if (!options?.silent) {
      toast.error(message, {
        description: "Este erro foi registrado para análise técnica.",
      });
    }
  }

  async critical(message: string, options?: LogOptions) {
    await this.saveLog("CRITICAL", message, options);
    if (!options?.silent) {
      toast.error(`CRÍTICO: ${message}`, {
        duration: 10000,
        description: "A equipe técnica foi notificada.",
      });
    }
  }
}

export const logger = new Logger();
