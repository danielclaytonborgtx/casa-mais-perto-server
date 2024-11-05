import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import Joi from "joi";

const server = Fastify();
const prisma = new PrismaClient();

// Habilitar CORS
server.register(cors, {
  origin: "*", // Ajuste conforme necessário
});

// Interfaces para o corpo das requisições
interface RegisterRequest {
  name: string;
  email: string;
  username: string;
  password: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface PropertyRequest {
  title: string;
  description: string;
  price: number;
  latitude: number;
  longitude: number;
  userId: number;
}

// Esquemas de validação
const registerSchema = Joi.object<RegisterRequest>({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object<LoginRequest>({
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const propertySchema = Joi.object<PropertyRequest>({
  title: Joi.string().required(),
  description: Joi.string().required(),
  price: Joi.number().required(),
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  userId: Joi.number().required(),
});

// Rota de registro de usuários
server.post(
  "/users",
  async (
    request: FastifyRequest<{ Body: RegisterRequest }>,
    reply: FastifyReply
  ) => {
    const { error } = registerSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { name, email, username, password } = request.body;

    try {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return reply.status(409).send({ error: "Username já utilizado" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          username,
          password: hashedPassword,
        },
      });

      return reply.status(201).send({ user });
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      return reply.status(500).send({ error: "Falha ao criar usuário" });
    }
  }
);

// Rota de login
server.post(
  "/session",
  async (
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply
  ) => {
    const { error } = loginSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { username, password } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { username } });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return reply
          .status(401)
          .send({ error: "Invalid username or password" });
      }

      return reply.send({ message: "Login successful", user });
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      return reply.status(500).send({ error: "Falha ao fazer login" });
    }
  }
);

// Rota de registro de imóveis
server.post(
  "/property",
  async (
    request: FastifyRequest<{ Body: PropertyRequest }>,
    reply: FastifyReply
  ) => {
    const { error } = propertySchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { title, description, userId, price, latitude, longitude } =
      request.body;

    try {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        return reply.status(404).send({
          error: "Usuário não encontrado, deve estar logado para adicionar!",
        });
      }

      const property = await prisma.property.create({
        data: {
          title,
          description,
          userId,
          latitude,
          longitude,
          price,
        },
      });

      return reply.status(201).send({ property });
    } catch (error) {
      console.error("Erro ao criar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao criar imóvel" });
    }
  }
);

// Outras rotas relacionadas a imóveis
server.get(
  "/property",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const properties = await prisma.property.findMany({
        include: { images: true },
      });
      return reply.send(properties);
    } catch (error) {
      console.error("Erro ao buscar imóveis:", error);
      return reply.status(500).send({ error: "Falha ao buscar imóveis" });
    }
  }
);

server.delete(
  "/property/:id",
  async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    const propertyId = Number(id);
    if (isNaN(propertyId)) {
      return reply
        .status(400)
        .send({ error: "ID do imóvel deve ser um número válido" });
    }

    try {
      const existingProperty = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { images: true },
      });

      if (!existingProperty) {
        return reply.status(404).send({ error: "Imóvel não encontrado" });
      }

      await prisma.image.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });

      return reply.status(200).send({ message: "Imóvel deletado com sucesso" });
    } catch (error) {
      console.error("Erro ao deletar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao deletar imóvel" });
    }
  }
);

// Iniciar o servidor
server.listen({ port: 3333, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log("Server listening at http://localhost:3333");
});
