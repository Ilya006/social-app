import db from "./../dummy";
import User from "./../../models/User";
import { signupvalidatation } from "./../../middlewares/validation/userValidation";
import { loginValidatation } from "./../../middlewares/validation/userValidation";
import * as jwt from "jsonwebtoken";
import * as shortid from "shortid";
import { userAuth, adminAuth } from "../../middlewares/auth";
import { createWriteStream } from "fs";
import * as mkdirp from "mkdirp";

const uploadDir = "./client/public/images/users_images";

// Ensure upload directory exists
mkdirp.sync(uploadDir);

const storeUpload = async ({ stream, filename }: any): Promise<any> => {
  const id = shortid.generate();
  const fileName = `${id}-${filename}`;
  const path = `${uploadDir}/${id}-${filename}`;

  return new Promise((resolve, reject) =>
    stream
      .pipe(createWriteStream(path))
      .on("finish", () => resolve({ path, fileName }))
      .on("error", reject)
  );
};

const processUpload = async (upload: any) => {
  const { createReadStream, filename } = await upload;
  const stream = createReadStream();
  const { path, fileName } = await storeUpload({ stream, filename });

  console.log(path, fileName);

  return { path, fileName };
};

const userResolver = {
  Query: {
    // current user query
    me: async (_, __, { req, res }) => {
      try {
        await userAuth(req);

        let myId = req.user.userId;

        let me = User.findById(myId).exec();

        return {
          ok: true,
          user: me
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },
    // all users query
    users: async (parent: any, { id }, { req, res }) => {
      try {
        //await userAuth(req);

        return {
          ok: true,
          users: await User.find()
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },
    // one user query
    userInfo: async (parent: any, { userName }, { req, res }) => {
      try {
        //await userAuth(req);

        return {
          user: await User.findOne({ userName: userName }).exec(),
          ok: true
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    }
  },
  User: {
    messages: (parent: any) => db.messages.filter(message => message.user === parent.id)
  },
  Mutation: {
    //signup mutation
    signUp: async (_, args: any, context: any) => {
      try {
        // 1- validate input data
        await signupvalidatation.validate(args);

        // 2- create new user and save it in the DB
        const newUser = new User({
          userName: args.userName,
          email: args.email,
          password: args.password,
          verifyPassword: args.verifyPassword,
          firstName: args.firstName,
          lastName: args.lastName,
          role: "user"
        });

        const user = newUser.save();

        // 3- sign a new token with the required data
        const token = jwt.sign(
          { userId: newUser.id, role: newUser.role },
          process.env.JWT_SECRET,
          {
            expiresIn: "1y"
          }
        );

        // 4- set a cookies with the token value and it's httpOnly
        context.res.cookie("token", token, {
          expires: new Date(Date.now() + 900000),
          httpOnly: true,
          secure: true,
          domain: "localhost",
          path: "/"
        });

        return { ok: true, user, token };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },
    // login mutation
    login: async (_parent: any, args: any, context: any) => {
      try {
        //1- validate input data
        await loginValidatation.validate(args);

        // 2- find user
        const userName = args.userName;
        const user = await User.findOne({ userName: userName });

        if (!user) {
          return {
            ok: false,
            error: "no such user"
          };
        }

        // 3- sign a new token
        const token = jwt.sign(
          { userId: user.id, role: user.role },
          process.env.JWT_SECRET,
          {
            expiresIn: "1y"
          }
        );

        // 4- set a cookies with the token value and it's httpOnly
        context.res.cookie("token", token, {
          expires: new Date(Date.now() + 18000000),
          httpOnly: true,
          secure: true,
          domain: "localhost",
          path: "/"
        });

        return { ok: true, user, token };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },
    //logout Mutation
    logout: async (_, __, { req, res }) => {
      res.clearCookie("token", {
        domain: "localhost",
        path: "/"
      });

      return {
        ok: true
      };
    },
    // Delete user mutation
    deleteUser: async (_, args, { req, res }) => {
      try {
        // 1- authenticate user
        await adminAuth(req);

        // 2- find user
        const id = args.id;
        await User.findByIdAndDelete(id);

        return {
          ok: true
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },
    // Delete user mutation
    singleUpload: async (_, { file }, { req, res }) => {
      try {
        await userAuth(req);

        let myId = req.user.userId;

        await Promise.all(file.map(processUpload)).then(res => {
          const newPics = res.map((image: any) => image.fileName);

          User.findByIdAndUpdate(
            { _id: myId },
            { $push: { pictures: { $each: newPics } } },
            { useFindAndModify: false, upsert: true }
          ).exec();
        });

        return {
          ok: true
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    }
  }
};

export default userResolver;
